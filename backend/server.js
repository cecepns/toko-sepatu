/**
 * POS Toko Sepatu — Express (single store, product variants)
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv/config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(import.meta.dirname, 'uploads');
const UPLOAD_PUBLIC_PATH = '/uploads';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SPORT_TYPE_VALUES = ['sepak_bola', 'futsal', 'running', 'badminton', 'umum'];

function normalizeSportType(value) {
  return SPORT_TYPE_VALUES.includes(value) ? value : 'umum';
}

/** Kategori dianggap sepatu jika nama mengandung "sepatu" (case-insensitive). */
const SQL_CATEGORY_IS_SHOE = `LOWER(c.name) LIKE '%sepatu%'`;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pos_toko_sepatu',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) {
      return cb(new Error('Hanya gambar jpeg/png/webp/gif'));
    }
    cb(null, true);
  },
});

function ok(res, data = null, message = '', pagination = {}) {
  return res.json({ success: true, message, data, pagination });
}

function fail(res, status, message, errors = null) {
  const body = { success: false, message, data: null, pagination: {} };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const offset = (page - 1) * limit;
  const search = (query.search || '').trim();
  const sort = (query.sort || 'id').replace(/[^a-zA-Z0-9_]/g, '');
  const order = String(query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, limit, offset, search, sort, order };
}

function sqlActiveVariantPromoJoin() {
  return `
  LEFT JOIN (
    SELECT pp.id, pp.variant_id, pp.promo_price, pp.valid_from, pp.valid_until
    FROM product_promos pp
    INNER JOIN (
      SELECT variant_id, MAX(id) AS pick_id
      FROM product_promos
      WHERE CURDATE() BETWEEN valid_from AND valid_until
      GROUP BY variant_id
    ) pk ON pk.pick_id = pp.id
  ) apr ON apr.variant_id = v.id `;
}

function sqlEffectiveVariantPrice() {
  return `CASE WHEN apr.id IS NOT NULL THEN apr.promo_price ELSE v.retail_price END`;
}

function sqlSingleSaleCogsScalar() {
  return `(SELECT COALESCE(SUM(si.quantity * pv.hpp), 0)
    FROM sale_items si
    JOIN product_variants pv ON pv.id = si.variant_id
    WHERE si.sale_id = s.id)`;
}

async function assertPromoNoDateOverlap(poolOrConn, variantId, validFrom, validUntil, excludeId = null) {
  const vf = String(validFrom).slice(0, 10);
  const vt = String(validUntil).slice(0, 10);
  if (vf > vt) throw new Error('Tanggal berlaku tidak valid');
  const params = { pid: variantId, vf, vt };
  let sql =
    `SELECT id FROM product_promos WHERE variant_id=:pid AND NOT (valid_until < :vf OR valid_from > :vt)`;
  if (excludeId != null && Number(excludeId) > 0) {
    sql += ' AND id <> :ex ';
    params.ex = Number(excludeId);
  }
  sql += ' LIMIT 1';
  const [rows] = await poolOrConn.query(sql, params);
  if (rows.length) throw new Error('Sudah ada promo lain untuk varian ini yang beririsan tanggalnya');
}

async function logActivity(userId, action, entity, entityId, meta, ip) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, entity, entity_id, meta, ip_address)
       VALUES (:userId, :action, :entity, :entityId, :meta, :ip)`,
      {
        userId,
        action,
        entity,
        entityId: entityId != null ? String(entityId) : null,
        meta: meta ? JSON.stringify(meta) : null,
        ip: ip || null,
      }
    );
  } catch (e) {
    console.error('activity_logs', e.message);
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return fail(res, 401, 'Token tidak ada');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_active, r.slug AS role_slug, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :id LIMIT 1`,
      { id: decoded.sub }
    );
    const user = rows[0];
    if (!user || !user.is_active) return fail(res, 401, 'User tidak valid');
    req.user = user;
    return next();
  } catch {
    return fail(res, 401, 'Token tidak valid');
  }
}

function requireRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 401, 'Unauthorized');
    if (allowed.includes(req.user.role_slug) || req.user.role_slug === 'admin') {
      return next();
    }
    return fail(res, 403, 'Akses ditolak');
  };
}

function multerErr(err, _req, res, next) {
  if (err instanceof multer.MulterError || err?.message) {
    return fail(res, 400, err.message || 'Upload gagal');
  }
  next(err);
}

function saleNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `INV-${ymd}-${rnd}`;
}

function normalizePaymentMethod(raw) {
  const m = String(raw || 'cash').toLowerCase().trim();
  if (m === 'cash' || m === 'tunai') return 'cash';
  return 'non_cash';
}

function sqlSalePaymentJoin() {
  return `LEFT JOIN payments pay ON pay.sale_id = s.id AND pay.id = (
    SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id
  )`;
}

async function nextSku(conn) {
  const [rows] = await conn.query(`SELECT sku FROM product_variants ORDER BY id DESC LIMIT 1`);
  const last = rows[0]?.sku;
  const n = last && /^SKU-(\d+)$/.test(last) ? Number(RegExp.$1) + 1 : 1;
  return `SKU-${String(n).padStart(5, '0')}`;
}

function variantSelectFields() {
  const promoJoin = sqlActiveVariantPromoJoin();
  const eff = sqlEffectiveVariantPrice();
  return {
    promoJoin,
    fields: `
      v.id, v.model_id, v.sku, v.barcode, v.color, v.size, v.sport_type,
      v.hpp, v.retail_price, v.quantity, v.min_stock, v.is_active,
      (${eff}) AS effective_price,
      apr.promo_price AS active_promo_price,
      pm.name AS model_name, pm.brand AS model_brand, pm.image_url AS model_image,
      c.name AS category_name`,
  };
}

/* ============================== ROUTES ============================== */

app.get('/api/health', (_req, res) => ok(res, { ok: true, ts: Date.now() }, 'OK'));

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return fail(res, 400, 'Email dan password wajib');
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.is_active, r.slug AS role_slug, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = :email LIMIT 1`,
      { email }
    );
    const u = rows[0];
    if (!u || !u.is_active) return fail(res, 401, 'Kredensial salah');
    const match = await bcrypt.compare(password, u.password_hash);
    if (!match) return fail(res, 401, 'Kredensial salah');
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = :id', { id: u.id });
    const token = signToken({ sub: u.id, role: u.role_slug });
    await logActivity(u.id, 'login', 'user', u.id, { email }, req.ip);
    return ok(
      res,
      {
        token,
        user: {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role_slug: u.role_slug,
          role_name: u.role_name,
        },
      },
      'Login berhasil'
    );
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => ok(res, req.user, 'Session aktif'));

app.get('/api/roles', authMiddleware, requireRoles('admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, slug FROM roles ORDER BY id`);
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Users */
app.get('/api/users', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (u.full_name LIKE :s OR u.email LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'full_name', 'email', 'created_at'].includes(sort) ? `u.${sort}` : 'u.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS u.id, u.email, u.full_name, u.phone, u.is_active, u.role_id, r.slug AS role_slug, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/users', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { email, password, full_name, phone, role_id, is_active } = req.body || {};
    if (!email || !password || !full_name || !role_id) return fail(res, 400, 'Data tidak lengkap');
    const hash = await bcrypt.hash(password, 10);
    const [ins] = await pool.query(
      `INSERT INTO users (role_id, email, password_hash, full_name, phone, is_active)
       VALUES (:role_id, :email, :hash, :full_name, :phone, :act)`,
      {
        role_id: Number(role_id),
        email,
        hash,
        full_name,
        phone: phone || null,
        act: is_active === false || is_active === 'false' ? 0 : 1,
      }
    );
    return ok(res, { id: ins.insertId }, 'User dibuat');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Email sudah dipakai');
    return fail(res, 500, e.message);
  }
});

app.put('/api/users/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { email, password, full_name, phone, role_id, is_active } = req.body || {};
    const params = {
      id,
      email,
      full_name,
      phone: phone || null,
      role_id: Number(role_id),
      act: is_active === false || is_active === 'false' ? 0 : 1,
    };
    let sql = `UPDATE users SET email=:email, full_name=:full_name, phone=:phone, role_id=:role_id, is_active=:act`;
    if (password) {
      params.hash = await bcrypt.hash(password, 10);
      sql += ', password_hash=:hash';
    }
    sql += ' WHERE id=:id';
    await pool.query(sql, params);
    return ok(res, null, 'User diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/users/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return fail(res, 400, 'Tidak bisa hapus akun sendiri');
    await pool.query(`DELETE FROM users WHERE id=:id`, { id });
    return ok(res, null, 'User dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Categories */
app.get('/api/categories', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND name LIKE :s ';
      params.s = `%${search}%`;
    }
    if (req.query.active_only === '1' || req.query.active_only === 'true') {
      where += ' AND is_active = 1 ';
    }
    const sortCol = ['id', 'name', 'created_at'].includes(sort) ? sort : 'id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * FROM categories ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/categories', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { name, description, is_active } = req.body || {};
    if (!name) return fail(res, 400, 'Nama wajib');
    const [ins] = await pool.query(
      `INSERT INTO categories (name, description, is_active) VALUES (:name, :desc, :act)`,
      { name, desc: description || null, act: is_active === false ? 0 : 1 }
    );
    return ok(res, { id: ins.insertId }, 'Kategori dibuat');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/api/categories/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { name, description, is_active } = req.body || {};
    await pool.query(
      `UPDATE categories SET name=:name, description=:desc, is_active=:act WHERE id=:id`,
      { id: Number(req.params.id), name, desc: description || null, act: is_active === false ? 0 : 1 }
    );
    return ok(res, null, 'Kategori diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/categories/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM categories WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Kategori dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Product models */
app.get('/api/product-models', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (pm.name LIKE :s OR pm.brand LIKE :s) ';
      params.s = `%${search}%`;
    }
    if (req.query.category_id) {
      where += ' AND pm.category_id = :cid ';
      params.cid = Number(req.query.category_id);
    }
    if (req.query.active_only === '1' || req.query.active_only === 'true') {
      where += ' AND pm.is_active = 1 ';
    }
    const sortCol = ['id', 'name', 'brand', 'created_at'].includes(sort) ? `pm.${sort}` : 'pm.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS pm.*, c.name AS category_name,
        (SELECT COUNT(*) FROM product_variants pv WHERE pv.model_id = pm.id) AS variant_count,
        (SELECT COALESCE(SUM(pv.quantity),0) FROM product_variants pv WHERE pv.model_id = pm.id) AS total_stock
       FROM product_models pm
       JOIN categories c ON c.id = pm.category_id
       ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/product-models/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [pm] = await pool.query(
      `SELECT pm.*, c.name AS category_name FROM product_models pm
       JOIN categories c ON c.id = pm.category_id WHERE pm.id=:id`,
      { id }
    );
    if (!pm[0]) return fail(res, 404, 'Model tidak ditemukan');
    const { promoJoin, fields } = variantSelectFields();
    const [variants] = await pool.query(
      `SELECT ${fields}
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${promoJoin}
       WHERE v.model_id = :id
       ORDER BY v.color, v.size, v.sport_type`,
      { id }
    );
    return ok(res, { ...pm[0], variants }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post(
  '/api/product-models',
  authMiddleware,
  requireRoles('admin'),
  upload.single('image'),
  multerErr,
  async (req, res) => {
    try {
      const { category_id, name, brand, description, is_active } = req.body || {};
      if (!category_id || !name) return fail(res, 400, 'Kategori dan nama wajib');
      const img = req.file ? `${UPLOAD_PUBLIC_PATH}/${req.file.filename}` : null;
      const [ins] = await pool.query(
        `INSERT INTO product_models (category_id, name, brand, description, image_url, is_active)
         VALUES (:cid, :name, :brand, :desc, :img, :act)`,
        {
          cid: Number(category_id),
          name,
          brand: brand || null,
          desc: description || null,
          img,
          act: is_active === 'false' || is_active === false ? 0 : 1,
        }
      );
      return ok(res, { id: ins.insertId }, 'Model produk dibuat');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  }
);

app.put(
  '/api/product-models/:id',
  authMiddleware,
  requireRoles('admin'),
  upload.single('image'),
  multerErr,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { category_id, name, brand, description, is_active } = req.body || {};
      const params = {
        id,
        cid: Number(category_id),
        name,
        brand: brand || null,
        desc: description || null,
        act: is_active === 'false' || is_active === false ? 0 : 1,
      };
      let sql = `UPDATE product_models SET category_id=:cid, name=:name, brand=:brand, description=:desc, is_active=:act`;
      if (req.file) {
        params.img = `${UPLOAD_PUBLIC_PATH}/${req.file.filename}`;
        sql += ', image_url=:img';
      }
      sql += ' WHERE id=:id';
      await pool.query(sql, params);
      return ok(res, null, 'Model diperbarui');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  }
);

app.delete('/api/product-models/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM product_models WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Model dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Product variants */
app.get('/api/product-variants', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (v.sku LIKE :s OR v.barcode LIKE :s OR pm.name LIKE :s OR v.color LIKE :s) ';
      params.s = `%${search}%`;
    }
    if (req.query.model_id) {
      where += ' AND v.model_id = :mid ';
      params.mid = Number(req.query.model_id);
    }
    if (req.query.sport_type) {
      where += ' AND v.sport_type = :st ';
      params.st = req.query.sport_type;
    }
    if (req.query.active_only === '1' || req.query.active_only === 'true') {
      where += ' AND v.is_active = 1 AND pm.is_active = 1 ';
    }
    if (req.query.in_stock === '1' || req.query.in_stock === 'true') {
      where += ' AND v.quantity > 0 ';
    }
    const { promoJoin, fields } = variantSelectFields();
    const sortCol = ['id', 'sku', 'retail_price', 'quantity', 'created_at'].includes(sort) ? `v.${sort}` : 'v.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS ${fields}
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${promoJoin}
       ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/product-variants', authMiddleware, requireRoles('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { model_id, color, size, sport_type, barcode, hpp, retail_price, quantity, min_stock, is_active } =
      req.body || {};
    if (!model_id || !color || !size) return fail(res, 400, 'Model, warna, dan ukuran wajib');
    const st = normalizeSportType(sport_type);
    await conn.beginTransaction();
    const sku = await nextSku(conn);
    const [ins] = await conn.query(
      `INSERT INTO product_variants (model_id, sku, barcode, color, size, sport_type, hpp, retail_price, quantity, min_stock, is_active)
       VALUES (:mid, :sku, :bc, :color, :size, :st, :hpp, :retail, :qty, :minst, :act)`,
      {
        mid: Number(model_id),
        sku,
        bc: barcode || null,
        color,
        size,
        st,
        hpp: Number(hpp) || 0,
        retail: Number(retail_price) || 0,
        qty: Number(quantity) || 0,
        minst: Number(min_stock) || 0,
        act: is_active === false || is_active === 'false' ? 0 : 1,
      }
    );
    const vid = ins.insertId;
    if (Number(quantity) > 0) {
      await conn.query(
        `INSERT INTO stock_mutations (variant_id, mutation_type, quantity_delta, notes, created_by)
         VALUES (:vid, 'restock', :d, 'Stok awal varian', :uid)`,
        { vid, d: Number(quantity), uid: req.user.id }
      );
    }
    await conn.commit();
    return ok(res, { id: vid, sku }, 'Varian dibuat');
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'SKU/Barcode atau kombinasi varian duplikat');
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.put('/api/product-variants/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { color, size, sport_type, barcode, hpp, retail_price, min_stock, is_active } = req.body || {};
    const st = normalizeSportType(sport_type);
    await pool.query(
      `UPDATE product_variants SET color=:color, size=:size, sport_type=:st, barcode=:bc,
        hpp=:hpp, retail_price=:retail, min_stock=:minst, is_active=:act WHERE id=:id`,
      {
        id,
        color,
        size,
        st,
        bc: barcode || null,
        hpp: Number(hpp) || 0,
        retail: Number(retail_price) || 0,
        minst: Number(min_stock) || 0,
        act: is_active === false || is_active === 'false' ? 0 : 1,
      }
    );
    return ok(res, null, 'Varian diperbarui');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Barcode atau kombinasi varian duplikat');
    return fail(res, 500, e.message);
  }
});

app.delete('/api/product-variants/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM product_variants WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Varian dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

function stockListWhere(query) {
  let where = ' WHERE v.is_active = 1 AND pm.is_active = 1 ';
  const params = {};
  if (query.search) {
    where += ' AND (v.sku LIKE :s OR pm.name LIKE :s OR v.color LIKE :s OR pm.brand LIKE :s) ';
    params.s = `%${query.search}%`;
  }
  if (query.low_only === '1' || query.low_only === 'true') {
    where += ' AND v.quantity <= v.min_stock ';
  }
  if (query.category_id) {
    where += ' AND pm.category_id = :cid ';
    params.cid = Number(query.category_id);
  }
  if (query.brand) {
    where += ' AND TRIM(pm.brand) = :brand ';
    params.brand = String(query.brand).trim();
  }
  return { where, params };
}

/* Stock */
app.get('/api/stock/summary', authMiddleware, async (req, res) => {
  try {
    const { where, params } = stockListWhere(req.query);
    const [totals] = await pool.query(
      `SELECT COALESCE(SUM(v.quantity),0) AS total_quantity,
        COUNT(v.id) AS variant_count,
        COALESCE(SUM(v.quantity * v.hpp),0) AS total_asset
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${where}`,
      params
    );
    const [byCategory] = await pool.query(
      `SELECT c.id AS category_id, c.name AS category_name,
        COALESCE(SUM(v.quantity),0) AS total_quantity
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${where}
       GROUP BY c.id, c.name ORDER BY total_quantity DESC, c.name`,
      params
    );
    const [byBrand] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(pm.brand), ''), 'Tanpa merek') AS brand,
        COALESCE(SUM(v.quantity),0) AS total_quantity
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${where}
       GROUP BY brand ORDER BY total_quantity DESC, brand`,
      params
    );
    const [brands] = await pool.query(
      `SELECT DISTINCT TRIM(pm.brand) AS brand
       FROM product_models pm
       WHERE pm.is_active = 1 AND pm.brand IS NOT NULL AND TRIM(pm.brand) != ''
       ORDER BY brand`
    );
    return ok(res, {
      totals: totals[0],
      by_category: byCategory,
      by_brand: byBrand,
      brands: brands.map((r) => r.brand),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/stock', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    const { where, params } = stockListWhere({ ...req.query, search });
    const sortCol = ['quantity', 'sku', 'name'].includes(sort)
      ? sort === 'name'
        ? 'pm.name'
        : `v.${sort}`
      : 'v.quantity';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS v.id AS variant_id, v.sku, v.color, v.size, v.sport_type,
        v.quantity, v.min_stock, v.hpp, v.retail_price, pm.name AS model_name, pm.brand, c.name AS category_name
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/stock/adjust', authMiddleware, requireRoles('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { variant_id, quantity_delta, notes } = req.body || {};
    const vid = Number(variant_id);
    const delta = Number(quantity_delta);
    if (!vid || !delta) return fail(res, 400, 'Varian dan selisih qty wajib');
    await conn.beginTransaction();
    const [v] = await conn.query(`SELECT quantity FROM product_variants WHERE id=:id FOR UPDATE`, { id: vid });
    if (!v[0]) {
      await conn.rollback();
      return fail(res, 404, 'Varian tidak ada');
    }
    const newQty = v[0].quantity + delta;
    if (newQty < 0) {
      await conn.rollback();
      return fail(res, 400, 'Stok tidak boleh negatif');
    }
    await conn.query(`UPDATE product_variants SET quantity = :q WHERE id=:id`, { q: newQty, id: vid });
    await conn.query(
      `INSERT INTO stock_mutations (variant_id, mutation_type, quantity_delta, notes, created_by)
       VALUES (:vid, 'adjustment', :d, :notes, :uid)`,
      { vid, d: delta, notes: notes || 'Koreksi stok', uid: req.user.id }
    );
    await conn.commit();
    return ok(res, { quantity: newQty }, 'Stok diperbarui');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.get('/api/stock-mutations', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.query.variant_id) {
      where += ' AND sm.variant_id = :vid ';
      params.vid = Number(req.query.variant_id);
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS sm.*, v.sku, pm.name AS model_name, u.full_name AS created_by_name
       FROM stock_mutations sm
       JOIN product_variants v ON v.id = sm.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       LEFT JOIN users u ON u.id = sm.created_by
       ${where}
       ORDER BY sm.id DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Product promos */
app.get('/api/product-promos/today-popup', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT pr.id, pr.variant_id, pr.promo_price, pr.valid_from, pr.valid_until,
        pm.name AS model_name, v.sku, v.color, v.size, v.sport_type
       FROM product_promos pr
       JOIN product_variants v ON v.id = pr.variant_id AND v.is_active = 1
       JOIN product_models pm ON pm.id = v.model_id AND pm.is_active = 1
       WHERE CURDATE() BETWEEN pr.valid_from AND pr.valid_until
       ORDER BY pr.id DESC LIMIT 20`
    );
    return ok(res, { promos: rows }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/product-promos', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let searchWhere = '';
    const params = {};
    if (search) {
      searchWhere = ' AND (pm.name LIKE :s OR v.sku LIKE :s) ';
      params.s = `%${search}%`;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS pp.*, pm.name AS model_name, v.sku, v.color, v.size, v.sport_type
       FROM product_promos pp
       JOIN product_variants v ON v.id = pp.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       WHERE 1=1 ${searchWhere}
       ORDER BY pp.id DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/product-promos', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { variant_id, promo_price, valid_from, valid_until } = req.body || {};
    const vid = Number(variant_id);
    if (!vid || promo_price == null || !valid_from || !valid_until) return fail(res, 400, 'Data tidak lengkap');
    await assertPromoNoDateOverlap(pool, vid, valid_from, valid_until);
    const [ins] = await pool.query(
      `INSERT INTO product_promos (variant_id, promo_price, valid_from, valid_until)
       VALUES (:vid, :price, :vf, :vt)`,
      { vid, price: Number(promo_price), vf: valid_from, vt: valid_until }
    );
    return ok(res, { id: ins.insertId }, 'Promo dibuat');
  } catch (e) {
    return fail(res, 400, e.message);
  }
});

app.put('/api/product-promos/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { variant_id, promo_price, valid_from, valid_until } = req.body || {};
    const vid = Number(variant_id);
    await assertPromoNoDateOverlap(pool, vid, valid_from, valid_until, id);
    await pool.query(
      `UPDATE product_promos SET variant_id=:vid, promo_price=:price, valid_from=:vf, valid_until=:vt WHERE id=:id`,
      { id, vid, price: Number(promo_price), vf: valid_from, vt: valid_until }
    );
    return ok(res, null, 'Promo diperbarui');
  } catch (e) {
    return fail(res, 400, e.message);
  }
});

app.delete('/api/product-promos/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM product_promos WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Promo dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Customers */
app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (name LIKE :s OR code LIKE :s OR phone LIKE :s) ';
      params.s = `%${search}%`;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * FROM customers ${where}
       ORDER BY name ASC LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Sales / POS */
app.post('/api/sales', authMiddleware, requireRoles('admin', 'kasir'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { customer_id, items, discount_amount, tax_percent, notes, payment_method } = req.body || {};
    if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Keranjang kosong');

    await conn.beginTransaction();
    let subtotal = 0;
    const lineRows = [];
    const promoJoin = sqlActiveVariantPromoJoin();
    const eff = sqlEffectiveVariantPrice();

    for (const line of items) {
      const vid = Number(line.variant_id);
      if (!vid) {
        await conn.rollback();
        return fail(res, 400, 'Baris keranjang tidak valid');
      }
      const [vr] = await conn.query(
        `SELECT v.id, v.quantity, v.is_active, (${eff}) AS unit_price, pm.is_active AS model_active
         FROM product_variants v
         JOIN product_models pm ON pm.id = v.model_id
         ${promoJoin}
         WHERE v.id=:id FOR UPDATE`,
        { id: vid }
      );
      const v = vr[0];
      if (!v || !v.is_active || !v.model_active) {
        await conn.rollback();
        return fail(res, 400, `Varian ${vid} tidak tersedia`);
      }
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) {
        await conn.rollback();
        return fail(res, 400, 'Qty tidak valid');
      }
      if (v.quantity < qty) {
        await conn.rollback();
        return fail(res, 400, `Stok tidak cukup untuk varian ${vid}`);
      }
      const unit = Number(v.unit_price);
      const lineSub = unit * qty;
      subtotal += lineSub;
      lineRows.push({ variant_id: vid, qty, unit, lineSub });
    }

    const disc = Number(discount_amount) || 0;
    const taxP = Number(tax_percent) || 0;
    const afterDisc = Math.max(0, subtotal - disc);
    const taxAmt = (afterDisc * taxP) / 100;
    const grand = afterDisc + taxAmt;
    const sn = saleNumber();
    const payMethod = normalizePaymentMethod(payment_method);

    const [ins] = await conn.query(
      `INSERT INTO sales (sale_number, cashier_user_id, customer_id, subtotal, discount_amount, tax_amount, tax_percent, grand_total, notes)
       VALUES (:sn, :uid, :cid, :sub, :disc, :tax, :taxp, :grand, :notes)`,
      {
        sn,
        uid: req.user.id,
        cid: customer_id || null,
        sub: subtotal,
        disc,
        tax: taxAmt,
        taxp: taxP,
        grand,
        notes: notes || null,
      }
    );
    const saleId = ins.insertId;

    for (const lr of lineRows) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, line_subtotal)
         VALUES (:sid, :vid, :qty, :up, :ls)`,
        { sid: saleId, vid: lr.variant_id, qty: lr.qty, up: lr.unit, ls: lr.lineSub }
      );
      await conn.query(`UPDATE product_variants SET quantity = quantity - :q WHERE id=:vid`, {
        q: lr.qty,
        vid: lr.variant_id,
      });
      await conn.query(
        `INSERT INTO stock_mutations (variant_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (:vid, 'pos_sale', :d, 'sale', :sid, 'Penjualan POS', :uid)`,
        { vid: lr.variant_id, d: -lr.qty, sid: saleId, uid: req.user.id }
      );
    }

    await conn.query(
      `INSERT INTO payments (sale_id, method, amount) VALUES (:sid, :m, :amt)`,
      { sid: saleId, m: payMethod, amt: grand }
    );
    await conn.commit();
    await logActivity(req.user.id, 'create_sale', 'sale', saleId, { grand_total: grand }, req.ip);
    return ok(res, { id: saleId, sale_number: sn, grand_total: grand }, 'Transaksi berhasil');
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.get('/api/sales', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug === 'kasir') {
      where += ' AND s.cashier_user_id = :cashierSelf ';
      params.cashierSelf = req.user.id;
    }
    if (search) {
      where += ' AND (s.sale_number LIKE :s OR c.name LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'grand_total', 'created_at'].includes(sort) ? `s.${sort}` : 's.id';
    const payJoin = sqlSalePaymentJoin();
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS s.*, u.full_name AS cashier_name, c.name AS customer_name,
        pay.method AS payment_method
       FROM sales s
       JOIN users u ON u.id = s.cashier_user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       ${payJoin}
       ${where}
       ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/sales/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [s] = await pool.query(
      `SELECT s.*, u.full_name AS cashier_name FROM sales s
       JOIN users u ON u.id = s.cashier_user_id WHERE s.id=:id`,
      { id }
    );
    if (!s[0]) return fail(res, 404, 'Transaksi tidak ada');
    if (req.user.role_slug === 'kasir' && Number(s[0].cashier_user_id) !== Number(req.user.id)) {
      return fail(res, 403, 'Akses ditolak');
    }
    const [items] = await pool.query(
      `SELECT si.*, v.sku, v.color, v.size, v.sport_type, pm.name AS model_name
       FROM sale_items si
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       WHERE si.sale_id = :id`,
      { id }
    );
    const [payments] = await pool.query(`SELECT * FROM payments WHERE sale_id = :id`, { id });
    return ok(res, { ...s[0], items, payments }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/sales/:id', authMiddleware, requireRoles('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    await conn.beginTransaction();
    const [items] = await conn.query(`SELECT variant_id, quantity FROM sale_items WHERE sale_id=:id`, { id });
    for (const it of items) {
      await conn.query(`UPDATE product_variants SET quantity = quantity + :q WHERE id=:vid`, {
        q: it.quantity,
        vid: it.variant_id,
      });
    }
    await conn.query(`DELETE FROM sales WHERE id=:id`, { id });
    await conn.commit();
    return ok(res, null, 'Transaksi dibatalkan');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

/* Dashboard */
app.get('/api/dashboard/summary', authMiddleware, async (req, res) => {
  try {
    const staffToday = req.user.role_slug === 'kasir';
    const cashierClause = staffToday ? ' AND cashier_user_id = :staffSelf ' : '';
    const salesDateClause = staffToday
      ? ' AND DATE(created_at) = CURDATE() '
      : ' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ';
    const params = staffToday ? { staffSelf: req.user.id } : {};

    const [salesAgg] = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS revenue FROM sales WHERE 1=1 ${salesDateClause} ${cashierClause}`,
      params
    );

    const [topProducts] = await pool.query(
      `SELECT CONCAT(pm.name, ' — ', v.color, ' ', v.size) AS name, SUM(si.quantity) AS qty
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       WHERE 1=1 ${salesDateClause.replace('created_at', 's.created_at')}
       ${staffToday ? ' AND s.cashier_user_id = :staffSelf ' : ''}
       GROUP BY v.id ORDER BY qty DESC LIMIT 5`,
      params
    );

    const [lowStock] = await pool.query(
      `SELECT CONCAT(pm.name, ' — ', v.color, ' ', v.size) AS name, v.quantity, v.min_stock, v.sku
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       WHERE v.quantity <= v.min_stock
       ORDER BY v.quantity ASC LIMIT 10`
    );

    let series;
    if (staffToday) {
      const [hr] = await pool.query(
        `SELECT HOUR(created_at) AS h, SUM(grand_total) AS total FROM sales WHERE 1=1
         AND DATE(created_at) = CURDATE() ${cashierClause} GROUP BY HOUR(created_at) ORDER BY h`,
        params
      );
      series = hr;
    } else {
      const [s2] = await pool.query(
        `SELECT DATE(created_at) AS d, SUM(grand_total) AS total FROM sales WHERE 1=1
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY d`,
        params
      );
      series = s2;
    }

    const cogsPerSale = `(SELECT COALESCE(SUM(si.quantity * pv.hpp), 0)
      FROM sale_items si JOIN product_variants pv ON pv.id = si.variant_id WHERE si.sale_id = sales.id)`;
    const payJoin = sqlSalePaymentJoin();
    const [todayOmset] = await pool.query(
      `SELECT COUNT(*) AS trx_count, COALESCE(SUM(s.grand_total),0) AS total_omset,
        COALESCE(SUM(CASE WHEN pay.method = 'cash' THEN s.grand_total ELSE 0 END),0) AS omset_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'non_cash' THEN s.grand_total ELSE 0 END),0) AS omset_non_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'cash' THEN 1 ELSE 0 END),0) AS trx_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'non_cash' THEN 1 ELSE 0 END),0) AS trx_non_cash,
        COALESCE(SUM(s.grand_total - ${cogsPerSale.replace(/sales\.id/g, 's.id')}), 0) AS net_profit
       FROM sales s
       ${payJoin}
       WHERE DATE(s.created_at) = CURDATE() ${cashierClause.replace(/cashier_user_id/g, 's.cashier_user_id')}`,
      params
    );

    const [inventory] = await pool.query(
      `SELECT COALESCE(SUM(v.quantity),0) AS total_pairs,
        COALESCE(SUM(v.quantity * v.hpp),0) AS total_asset
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       WHERE v.is_active = 1 AND pm.is_active = 1 AND ${SQL_CATEGORY_IS_SHOE}`
    );

    const salesDateForTop = salesDateClause.replace(/created_at/g, 's.created_at');
    const [topCategories] = await pool.query(
      `SELECT c.name, SUM(si.quantity) AS qty, SUM(si.line_subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       WHERE 1=1 ${salesDateForTop}
       ${staffToday ? ' AND s.cashier_user_id = :staffSelf ' : ''}
       GROUP BY c.id, c.name ORDER BY qty DESC LIMIT 5`,
      params
    );

    const [topBrands] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(pm.brand), ''), 'Tanpa merek') AS brand, SUM(si.quantity) AS qty, SUM(si.line_subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       WHERE 1=1 ${salesDateForTop}
       ${staffToday ? ' AND s.cashier_user_id = :staffSelf ' : ''}
       GROUP BY brand ORDER BY qty DESC LIMIT 5`,
      params
    );

    return ok(
      res,
      {
        scope: staffToday ? 'staff_today' : 'admin',
        sales_30d: { count: salesAgg[0].cnt, revenue: salesAgg[0].revenue },
        top_products: topProducts,
        top_categories: topCategories,
        top_brands: topBrands,
        inventory: inventory[0],
        low_stock: lowStock,
        chart_sales: series,
        today_omset: todayOmset[0],
      },
      ''
    );
  } catch (e) {
    console.error(e);
    return fail(res, 500, e.message);
  }
});

/* Reports */
app.get('/api/reports/sales', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const period = req.query.period || 'day';
    const grp =
      period === 'month'
        ? "DATE_FORMAT(created_at, '%Y-%m')"
        : period === 'year'
          ? "DATE_FORMAT(created_at, '%Y')"
          : 'DATE(created_at)';
    const [rows] = await pool.query(
      `SELECT ${grp} AS period, COUNT(*) AS trx, SUM(grand_total) AS revenue,
        SUM(subtotal - ${sqlSingleSaleCogsScalar()}) AS gross_profit_estimate
       FROM sales s WHERE created_at >= :from AND created_at < DATE_ADD(:to, INTERVAL 1 DAY)
       GROUP BY period ORDER BY period`,
      { from: req.query.from || '1970-01-01', to: req.query.to || '2099-12-31' }
    );
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/pl', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS s.id, s.sale_number, s.created_at, s.subtotal, s.grand_total,
        ${sqlSingleSaleCogsScalar()} AS cogs
       FROM sales s
       WHERE s.created_at >= :from AND s.created_at < DATE_ADD(:to, INTERVAL 1 DAY)
       ORDER BY s.id DESC LIMIT :limit OFFSET :offset`,
      {
        from: req.query.from || '1970-01-01',
        to: req.query.to || '2099-12-31',
        limit,
        offset,
      }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/stock', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.sku, CONCAT(pm.name, ' — ', v.color, ' ', v.size) AS name,
        v.color, v.size, v.sport_type, v.quantity, v.min_stock, v.hpp, v.retail_price,
        c.name AS category_name
       FROM product_variants v
       JOIN product_models pm ON pm.id = v.model_id
       JOIN categories c ON c.id = pm.category_id
       ORDER BY pm.name, v.color, v.size`
    );
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/bestsellers', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.sku, CONCAT(pm.name, ' — ', v.color, ' ', v.size) AS name,
        SUM(si.quantity) AS qty_sold, SUM(si.line_subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       WHERE s.created_at >= :from AND s.created_at < DATE_ADD(:to, INTERVAL 1 DAY)
       GROUP BY v.id ORDER BY qty_sold DESC LIMIT 50`,
      { from: req.query.from || '1970-01-01', to: req.query.to || '2099-12-31' }
    );
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/daily-omset', authMiddleware, requireRoles('admin', 'kasir'), async (req, res) => {
  try {
    let cashierClause = '';
    const params = {
      from: req.query.from || '1970-01-01',
      to: req.query.to || '2099-12-31',
    };
    if (req.user.role_slug === 'kasir') {
      cashierClause = ' AND s.cashier_user_id = :uid ';
      params.uid = req.user.id;
    }
    const payJoin = sqlSalePaymentJoin();
    const [rows] = await pool.query(
      `SELECT DATE(s.created_at) AS report_date,
        COUNT(DISTINCT s.id) AS trx_count,
        COALESCE(SUM(s.grand_total),0) AS total_omset,
        COALESCE(SUM(CASE WHEN pay.method = 'cash' THEN s.grand_total ELSE 0 END),0) AS omset_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'non_cash' THEN s.grand_total ELSE 0 END),0) AS omset_non_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'cash' THEN 1 ELSE 0 END),0) AS trx_cash,
        COALESCE(SUM(CASE WHEN pay.method = 'non_cash' THEN 1 ELSE 0 END),0) AS trx_non_cash,
        COALESCE(SUM(s.grand_total - (${sqlSingleSaleCogsScalar()})), 0) AS net_profit
       FROM sales s
       ${payJoin}
       WHERE s.created_at >= :from AND s.created_at < DATE_ADD(:to, INTERVAL 1 DAY)
       ${cashierClause}
       GROUP BY DATE(s.created_at) ORDER BY report_date`,
      params
    );
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/transaction-lines', authMiddleware, requireRoles('admin'), async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let where = ` WHERE s.created_at >= :from AND s.created_at < DATE_ADD(:to, INTERVAL 1 DAY) `;
    const params = {
      from: req.query.from || '1970-01-01',
      to: req.query.to || '2099-12-31',
    };
    if (search) {
      where += ' AND (s.sale_number LIKE :s OR pm.name LIKE :s) ';
      params.s = `%${search}%`;
    }
    const payJoin = sqlSalePaymentJoin();
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS s.created_at, s.sale_number, u.full_name AS cashier_name,
        pay.method AS payment_method,
        CONCAT(pm.name, ' — ', v.color, ' ', v.size) AS product_name,
        v.sku, v.sport_type, si.quantity, si.unit_price, si.line_subtotal
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN users u ON u.id = s.cashier_user_id
       ${payJoin}
       JOIN product_variants v ON v.id = si.variant_id
       JOIN product_models pm ON pm.id = v.model_id
       ${where}
       ORDER BY s.created_at DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.listen(PORT, () => {
  console.log(`POS Toko Sepatu API http://localhost:${PORT}`);
});
