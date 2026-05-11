/**
 * POS Multi Cabang — Express server (single entry file, modular sections)
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
/** Path publik gambar (relatif); origin lengkap digabung di frontend */
const UPLOAD_PUBLIC_PATH = '/uploads';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pos_multicabang',
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

/* ------------------------------ Response helpers ------------------------------ */
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

async function countTotal(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows[0]?.total ?? 0;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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

/* ------------------------------ Auth ------------------------------ */
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
      `SELECT u.id, u.email, u.full_name, u.branch_id, u.is_active, r.slug AS role_slug, r.name AS role_name
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
    if (allowed.includes(req.user.role_slug) || req.user.role_slug === 'super_admin') {
      return next();
    }
    return fail(res, 403, 'Akses ditolak');
  };
}

function branchFilter(req, column = 'branch_id') {
  if (req.user.role_slug === 'super_admin') return { sql: '', params: {} };
  if (!req.user.branch_id) return { sql: ' AND 1=0 ', params: {} };
  return { sql: ` AND ${column} = :bf_branch `, params: { bf_branch: req.user.branch_id } };
}

/* ------------------------------ Multer error handler ------------------------------ */
function multerErr(err, _req, res, next) {
  if (err instanceof multer.MulterError || err?.message) {
    return fail(res, 400, err.message || 'Upload gagal');
  }
  next(err);
}

/* =============================================================================
   ROUTES
   ========================================================================== */

app.get('/api/health', (_req, res) => ok(res, { ok: true, ts: Date.now() }, 'OK'));

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return fail(res, 400, 'Email dan password wajib');
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.branch_id, u.is_active, r.slug AS role_slug, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = :email LIMIT 1`,
      { email }
    );
    const u = rows[0];
    if (!u || !u.is_active) return fail(res, 401, 'Kredensial salah');
    const match = await bcrypt.compare(password, u.password_hash);
    if (!match) return fail(res, 401, 'Kredensial salah');
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = :id', { id: u.id });
    const token = signToken({ sub: u.id, role: u.role_slug, bid: u.branch_id });
    await logActivity(u.id, 'login', 'user', u.id, { email }, req.ip);
    return ok(res, {
      token,
      user: {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        branch_id: u.branch_id,
        role_slug: u.role_slug,
        role_name: u.role_name,
      },
    }, 'Login berhasil');
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    let branch = null;
    if (req.user.branch_id) {
      const [b] = await pool.query(`SELECT * FROM branches WHERE id = :id`, { id: req.user.branch_id });
      branch = b[0] || null;
    }
    return ok(res, { ...req.user, branch }, 'Session aktif');
  } catch (e) {
    console.error(e);
    return fail(res, 500, 'Server error');
  }
});

/* Roles list (for forms) */
app.get('/api/roles', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, slug FROM roles ORDER BY id`);
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Branches */
app.get('/api/branches', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND id = :bid ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND (name LIKE :s OR code LIKE :s OR phone LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'name', 'code', 'status', 'created_at'].includes(sort) ? sort : 'id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * FROM branches ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post(
  '/api/branches',
  authMiddleware,
  requireRoles('super_admin'),
  async (req, res) => {
    try {
      const { code, name, address, phone, status, latitude, longitude, attendance_radius_meters } = req.body || {};
      if (!code || !name || !address || !phone) return fail(res, 400, 'Data cabang tidak lengkap');
      const [r] = await pool.query(
        `INSERT INTO branches (code, name, address, phone, status, latitude, longitude, attendance_radius_meters)
         VALUES (:code, :name, :address, :phone, :status, :lat, :lng, :rad)`,
        {
          code,
          name,
          address,
          phone,
          status: status === 'inactive' ? 'inactive' : 'active',
          lat: latitude ?? -6.2,
          lng: longitude ?? 106.816666,
          rad: attendance_radius_meters ?? 100,
        }
      );
      await logActivity(req.user.id, 'create', 'branch', r.insertId, { code }, req.ip);
      return ok(res, { id: r.insertId }, 'Cabang dibuat');
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Kode cabang sudah dipakai');
      return fail(res, 500, e.message);
    }
  }
);

app.put('/api/branches/:id', authMiddleware, requireRoles('super_admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE branches SET code=:code, name=:name, address=:address, phone=:phone, status=:status,
       latitude=:lat, longitude=:lng, attendance_radius_meters=:rad WHERE id=:id`,
      {
        id,
        code: req.body.code,
        name: req.body.name,
        address: req.body.address,
        phone: req.body.phone,
        status: req.body.status === 'inactive' ? 'inactive' : 'active',
        lat: req.body.latitude,
        lng: req.body.longitude,
        rad: req.body.attendance_radius_meters ?? 100,
      }
    );
    await logActivity(req.user.id, 'update', 'branch', id, {}, req.ip);
    return ok(res, { id }, 'Cabang diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Users */
app.get('/api/users', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug === 'admin_cabang') {
      where += ' AND (u.branch_id = :bid OR u.id = :self) AND r.slug != "super_admin" ';
      params.bid = req.user.branch_id;
      params.self = req.user.id;
    }
    if (search) {
      where += ' AND (u.full_name LIKE :s OR u.email LIKE :s OR u.phone LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'full_name', 'email', 'created_at'].includes(sort) ? `u.${sort}` : 'u.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS u.id, u.role_id, u.email, u.full_name, u.phone, u.branch_id, u.is_active, u.created_at,
              r.slug AS role_slug, r.name AS role_name, b.name AS branch_name
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.branch_id
       ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/users', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { email, password, full_name, phone, role_id, branch_id, is_active } = req.body || {};
    if (!email || !password || !full_name || !role_id) return fail(res, 400, 'Data user tidak lengkap');
    const [roles] = await pool.query(`SELECT slug FROM roles WHERE id=:id`, { id: role_id });
    const slug = roles[0]?.slug;
    if (!slug) return fail(res, 400, 'Role tidak valid');
    if (req.user.role_slug === 'admin_cabang') {
      if (slug === 'super_admin') return fail(res, 403, 'Tidak boleh membuat super admin');
      if (slug === 'admin_cabang' && Number(branch_id) !== Number(req.user.branch_id)) {
        return fail(res, 403, 'Admin cabang hanya untuk cabang sendiri');
      }
    }
    const hash = await bcrypt.hash(password, 10);
    const bid = slug === 'super_admin' ? null : branch_id || req.user.branch_id;
    const [ins] = await pool.query(
      `INSERT INTO users (role_id, branch_id, email, password_hash, full_name, phone, is_active)
       VALUES (:role_id, :branch_id, :email, :hash, :full_name, :phone, :is_active)`,
      { role_id, branch_id: bid, email, hash, full_name, phone: phone || null, is_active: is_active === false ? 0 : 1 }
    );
    await logActivity(req.user.id, 'create', 'user', ins.insertId, { email }, req.ip);
    return ok(res, { id: ins.insertId }, 'User dibuat');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Email sudah terdaftar');
    return fail(res, 500, e.message);
  }
});

app.put('/api/users/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.role_slug === 'admin_cabang') {
      const [chk] = await pool.query(`SELECT branch_id FROM users WHERE id=:id`, { id });
      if (!chk[0] || Number(chk[0].branch_id) !== Number(req.user.branch_id)) {
        if (id !== req.user.id) return fail(res, 403, 'Tidak dapat mengubah user cabang lain');
      }
    }
    const fields = ['full_name=:full_name', 'phone=:phone', 'is_active=:is_active', 'role_id=:role_id', 'branch_id=:branch_id'];
    const params = {
      id,
      full_name: req.body.full_name,
      phone: req.body.phone,
      is_active: req.body.is_active === false ? 0 : 1,
      role_id: req.body.role_id,
      branch_id: req.body.branch_id,
    };
    if (req.body.password) {
      fields.push('password_hash=:hash');
      params.hash = await bcrypt.hash(req.body.password, 10);
    }
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=:id`, params);
    await logActivity(req.user.id, 'update', 'user', id, {}, req.ip);
    return ok(res, { id }, 'User diperbarui');
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
    const sortCol = ['id', 'name', 'created_at'].includes(sort) ? sort : 'id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * FROM categories ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post(
  '/api/categories',
  authMiddleware,
  requireRoles('super_admin', 'admin_cabang'),
  async (req, res) => {
    try {
      const { name, description, is_active } = req.body || {};
      if (!name) return fail(res, 400, 'Nama kategori wajib');
      const [r] = await pool.query(
        `INSERT INTO categories (name, description, is_active) VALUES (:name, :desc, :act)`,
        { name, desc: description || null, act: is_active === false ? 0 : 1 }
      );
      await logActivity(req.user.id, 'create', 'category', r.insertId, { name }, req.ip);
      return ok(res, { id: r.insertId }, 'Kategori dibuat');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  }
);

app.put('/api/categories/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE categories SET name=:name, description=:desc, is_active=:act WHERE id=:id`,
      { id, name: req.body.name, desc: req.body.description, act: req.body.is_active === false ? 0 : 1 }
    );
    return ok(res, { id }, 'Kategori diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/categories/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`DELETE FROM categories WHERE id=:id`, { id });
    return ok(res, { id }, 'Kategori dihapus');
  } catch (e) {
    return fail(res, 400, 'Tidak dapat menghapus (ada relasi produk)');
  }
});

/* Units */
app.get('/api/units', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (name LIKE :s OR abbreviation LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'name', 'abbreviation'].includes(sort) ? sort : 'id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS * FROM units ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/units', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { name, abbreviation } = req.body || {};
    if (!name || !abbreviation) return fail(res, 400, 'Nama & singkatan wajib');
    const [r] = await pool.query(`INSERT INTO units (name, abbreviation) VALUES (:name, :abbr)`, { name, abbr: abbreviation });
    return ok(res, { id: r.insertId }, 'Satuan dibuat');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Singkatan sudah ada');
    return fail(res, 500, e.message);
  }
});

app.put('/api/units/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`UPDATE units SET name=:name, abbreviation=:abbr WHERE id=:id`, {
      id,
      name: req.body.name,
      abbr: req.body.abbreviation,
    });
    return ok(res, { id }, 'Satuan diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/units/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM units WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Satuan dihapus');
  } catch (e) {
    return fail(res, 400, 'Tidak dapat menghapus (ada relasi)');
  }
});

/* Products */
async function nextSku(conn) {
  const [rows] = await conn.query(`SELECT sku FROM products ORDER BY id DESC LIMIT 1`);
  const last = rows[0]?.sku;
  const n = last && /^SKU-(\d+)$/.test(last) ? Number(RegExp.$1) + 1 : 1;
  return `SKU-${String(n).padStart(5, '0')}`;
}

app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s OR p.barcode LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'name', 'sku', 'retail_price', 'created_at'].includes(sort) ? `p.${sort}` : 'p.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS p.*, c.name AS category_name, u.abbreviation AS unit_abbr,
              ROUND((p.retail_price - p.hpp) / NULLIF(p.hpp,0) * 100, 2) AS margin_percent
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN units u ON u.id = p.unit_id
       ${where}
       ORDER BY ${sortCol} ${order}
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/products/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT p.*, c.name AS category_name, u.name AS unit_name, u.abbreviation AS unit_abbr
       FROM products p JOIN categories c ON c.id=p.category_id JOIN units u ON u.id=p.unit_id WHERE p.id=:id`,
      { id }
    );
    if (!rows[0]) return fail(res, 404, 'Produk tidak ada');
    return ok(res, rows[0], '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post(
  '/api/products',
  authMiddleware,
  requireRoles('super_admin', 'admin_cabang'),
  upload.single('image'),
  multerErr,
  async (req, res) => {
    const conn = await pool.getConnection();
    try {
      const body = req.body;
      const {
        category_id,
        unit_id,
        name,
        barcode,
        hpp,
        retail_price,
        wholesale_price,
        min_wholesale_qty,
        min_stock,
        is_active,
      } = body;
      if (!category_id || !unit_id || !name || hpp === undefined || retail_price === undefined) {
        return fail(res, 400, 'Data produk tidak lengkap (wajib HPP & harga jual)');
      }
      const sku = await nextSku(conn);
      let image_url = null;
      if (req.file) image_url = `${UPLOAD_PUBLIC_PATH}/${req.file.filename}`;
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO products (category_id, unit_id, sku, name, barcode, image_url, hpp, retail_price, wholesale_price, min_wholesale_qty, min_stock, is_active)
         VALUES (:cid, :uid, :sku, :name, :barcode, :img, :hpp, :retail, :wh, :minwh, :minst, :act)`,
        {
          cid: Number(category_id),
          uid: Number(unit_id),
          sku,
          name,
          barcode: barcode || null,
          img: image_url,
          hpp: Number(hpp),
          retail: Number(retail_price),
          wh: Number(wholesale_price ?? retail_price),
          minwh: Number(min_wholesale_qty ?? 1),
          minst: Number(min_stock ?? 0),
          act: is_active === false || is_active === 'false' ? 0 : 1,
        }
      );
      const pid = r.insertId;
      await conn.query(`INSERT INTO stock_central (product_id, quantity) VALUES (:pid, 0) ON DUPLICATE KEY UPDATE product_id=product_id`, { pid });
      await conn.commit();
      await logActivity(req.user.id, 'create', 'product', pid, { sku }, req.ip);
      return ok(res, { id: pid, sku }, 'Produk dibuat');
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'SKU/Barcode duplikat');
      return fail(res, 500, e.message);
    } finally {
      conn.release();
    }
  }
);

app.put(
  '/api/products/:id',
  authMiddleware,
  requireRoles('super_admin', 'admin_cabang'),
  upload.single('image'),
  multerErr,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const b = req.body || {};
      let imageSql = '';
      const params = {
        id,
        category_id: b.category_id,
        unit_id: b.unit_id,
        name: b.name,
        barcode: b.barcode || null,
        hpp: Number(b.hpp),
        retail_price: Number(b.retail_price),
        wholesale_price: Number(b.wholesale_price ?? b.retail_price),
        min_wholesale_qty: Number(b.min_wholesale_qty ?? 1),
        min_stock: Number(b.min_stock ?? 0),
        is_active: b.is_active === false || b.is_active === 'false' ? 0 : 1,
      };
      if (req.file) {
        imageSql = ', image_url = :img';
        params.img = `${UPLOAD_PUBLIC_PATH}/${req.file.filename}`;
      }
      await pool.query(
        `UPDATE products SET category_id=:category_id, unit_id=:unit_id, name=:name, barcode=:barcode,
         hpp=:hpp, retail_price=:retail_price, wholesale_price=:wholesale_price,
         min_wholesale_qty=:min_wholesale_qty, min_stock=:min_stock, is_active=:is_active ${imageSql}
         WHERE id=:id`,
        params
      );
      return ok(res, { id }, 'Produk diperbarui');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  }
);

app.delete('/api/products/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM products WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Produk dihapus');
  } catch (e) {
    return fail(res, 400, 'Tidak dapat menghapus (ada penjualan/stok)');
  }
});

/* Stock central & branch */
app.get('/api/stock/central', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = sort === 'quantity' ? 'sc.quantity' : 'p.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS sc.*, p.name, p.sku, p.min_stock
       FROM stock_central sc JOIN products p ON p.id = sc.product_id
       ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/stock/branch/:branchId', authMiddleware, async (req, res) => {
  try {
    const branchId = Number(req.params.branchId);
    if (req.user.role_slug !== 'super_admin') {
      if (Number(req.user.branch_id) !== branchId) return fail(res, 403, 'Akses cabang ditolak');
    }
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE sb.branch_id = :bid ';
    const params = { bid: branchId };
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = sort === 'quantity' ? 'sb.quantity' : 'p.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS sb.*, p.name, p.sku, p.min_stock, p.hpp
       FROM stock_branch sb JOIN products p ON p.id = sb.product_id
       ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Stock transfers */
app.get('/api/stock-transfers', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND (st.to_branch_id = :bid OR st.requested_by = :uid) ';
      params.bid = req.user.branch_id;
      params.uid = req.user.id;
    }
    if (search) {
      where += ' AND st.transfer_number LIKE :s ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'status', 'created_at'].includes(sort) ? `st.${sort}` : 'st.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS st.*, b.name AS to_branch_name, u.full_name AS requested_by_name
       FROM stock_transfers st
       JOIN branches b ON b.id = st.to_branch_id
       JOIN users u ON u.id = st.requested_by
       ${where} ORDER BY ${sortCol} ${order} LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/stock-transfers/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [t] = await pool.query(`SELECT * FROM stock_transfers WHERE id=:id`, { id });
    if (!t[0]) return fail(res, 404, 'Transfer tidak ada');
    if (req.user.role_slug !== 'super_admin' && Number(t[0].to_branch_id) !== Number(req.user.branch_id)) {
      return fail(res, 403, 'Akses ditolak');
    }
    const [items] = await pool.query(
      `SELECT sti.*, p.name, p.sku FROM stock_transfer_items sti JOIN products p ON p.id = sti.product_id WHERE sti.transfer_id=:id`,
      { id }
    );
    return ok(res, { ...t[0], items }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/stock-transfers', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { to_branch_id, items, notes } = req.body || {};
    if (!to_branch_id || !Array.isArray(items) || !items.length) return fail(res, 400, 'Item transfer wajib');
    const from_source = 'central';
    const toBid = Number(to_branch_id);
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== toBid) {
      return fail(res, 403, 'Admin hanya boleh request ke cabang sendiri');
    }
    const num = `TRF-${Date.now()}`;
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO stock_transfers (transfer_number, from_source, from_branch_id, to_branch_id, status, requested_by, notes)
       VALUES (:num, :fs, NULL, :toBid, 'pending', :uid, :notes)`,
      { num, fs: from_source, toBid, uid: req.user.id, notes: notes || null }
    );
    const tid = ins.insertId;
    for (const it of items) {
      await conn.query(
        `INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (:tid, :pid, :qty)`,
        { tid, pid: it.product_id, qty: it.quantity }
      );
    }
    await conn.commit();
    await logActivity(req.user.id, 'create', 'stock_transfer', tid, { to_branch_id: toBid }, req.ip);
    return ok(res, { id: tid, transfer_number: num }, 'Pengajuan transfer dibuat');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.patch('/api/stock-transfers/:id/approve', authMiddleware, requireRoles('super_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const [t] = await conn.query(`SELECT * FROM stock_transfers WHERE id=:id FOR UPDATE`, { id });
    const tr = t[0];
    if (!tr || tr.status !== 'pending') return fail(res, 400, 'Transfer tidak dapat disetujui');
    const [items] = await conn.query(`SELECT * FROM stock_transfer_items WHERE transfer_id=:id`, { id });
    await conn.beginTransaction();
    for (const it of items) {
      const [sc] = await conn.query(`SELECT quantity FROM stock_central WHERE product_id=:pid FOR UPDATE`, { pid: it.product_id });
      if (!sc[0] || sc[0].quantity < it.quantity) {
        await conn.rollback();
        return fail(res, 400, `Stok pusat tidak cukup untuk produk ID ${it.product_id}`);
      }
      await conn.query(`UPDATE stock_central SET quantity = quantity - :q WHERE product_id=:pid`, { q: it.quantity, pid: it.product_id });
      await conn.query(
        `INSERT INTO stock_branch (branch_id, product_id, quantity) VALUES (:bid, :pid, :q)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        { bid: tr.to_branch_id, pid: it.product_id, q: it.quantity }
      );
      await conn.query(
        `INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (NULL, :pid, 'transfer_out', :d1, 'stock_transfer', :tid, 'Ke cabang', :uid)`,
        { pid: it.product_id, d1: -it.quantity, tid: id, uid: req.user.id }
      );
      await conn.query(
        `INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (:bid, :pid, 'transfer_in', :d2, 'stock_transfer', :tid, 'Dari pusat', :uid)`,
        { bid: tr.to_branch_id, pid: it.product_id, d2: it.quantity, tid: id, uid: req.user.id }
      );
    }
    await conn.query(
      `UPDATE stock_transfers SET status='completed', approved_by=:uid, approved_at=NOW() WHERE id=:id`,
      { uid: req.user.id, id }
    );
    await conn.commit();
    await logActivity(req.user.id, 'approve', 'stock_transfer', id, {}, req.ip);
    return ok(res, { id }, 'Transfer disetujui & stok diperbarui');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.patch('/api/stock-transfers/:id/reject', authMiddleware, requireRoles('super_admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`UPDATE stock_transfers SET status='rejected', approved_by=:uid, approved_at=NOW() WHERE id=:id AND status='pending'`, {
      uid: req.user.id,
      id,
    });
    return ok(res, { id }, 'Transfer ditolak');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Stock mutations log */
app.get('/api/stock-mutations', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND (sm.branch_id = :bid OR sm.branch_id IS NULL) ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s) ';
      params.s = `%${search}%`;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS sm.*, p.name AS product_name, p.sku, b.name AS branch_name
       FROM stock_mutations sm
       JOIN products p ON p.id = sm.product_id
       LEFT JOIN branches b ON b.id = sm.branch_id
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

/* Customers */
app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    const bf = branchFilter(req, 'c.branch_id');
    let where = ` WHERE 1=1 ${bf.sql}`;
    const params = { ...bf.params };
    if (search) {
      where += ' AND (c.name LIKE :s OR c.code LIKE :s OR c.phone LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'name', 'code', 'created_at'].includes(sort) ? `c.${sort}` : 'c.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS c.*, m.tier, m.points,
              (SELECT COUNT(*) FROM resellers r WHERE r.customer_id = c.id AND r.is_active=1) AS is_reseller
       FROM customers c
       LEFT JOIN memberships m ON m.customer_id = c.id
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

app.post('/api/customers', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { name, phone, address, branch_id } = req.body || {};
    if (!name) return fail(res, 400, 'Nama customer wajib');
    const code = `CUST-${Date.now()}`;
      const bid = branch_id != null && branch_id !== '' ? Number(branch_id) : req.user.branch_id || null;
    const [r] = await pool.query(
      `INSERT INTO customers (branch_id, code, name, phone, address, is_active) VALUES (:bid, :code, :name, :phone, :addr, 1)`,
      { bid, code, name, phone: phone || null, addr: address || null }
    );
    await pool.query(`INSERT INTO memberships (customer_id, tier, points) VALUES (:cid, 'bronze', 0)`, { cid: r.insertId });
    return ok(res, { id: r.insertId, code }, 'Customer dibuat');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/api/customers/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE customers SET name=:name, phone=:phone, address=:addr, is_active=:act WHERE id=:id`,
      { id, name: req.body.name, phone: req.body.phone, addr: req.body.address, act: req.body.is_active === false ? 0 : 1 }
    );
    if (req.body.tier || req.body.points != null) {
      await pool.query(
        `INSERT INTO memberships (customer_id, tier, points) VALUES (:id, :tier, :pts)
         ON DUPLICATE KEY UPDATE tier=VALUES(tier), points=VALUES(points)`,
        { id, tier: req.body.tier || 'bronze', pts: req.body.points ?? 0 }
      );
    }
    return ok(res, { id }, 'Customer diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/customers/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM customers WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Customer dihapus');
  } catch (e) {
    return fail(res, 400, 'Tidak dapat menghapus (ada transaksi)');
  }
});

/* Resellers */
app.get('/api/resellers', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    const bf = branchFilter(req, 'c.branch_id');
    let where = ` WHERE 1=1 ${bf.sql}`;
    const params = { ...bf.params };
    if (search) {
      where += ' AND (c.name LIKE :s OR r.company_name LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'company_name', 'created_at'].includes(sort) ? (sort === 'id' ? 'r.id' : sort === 'created_at' ? 'r.created_at' : 'r.company_name') : 'r.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS r.*, c.name AS customer_name, c.phone, c.address, c.code AS customer_code
       FROM resellers r JOIN customers c ON c.id = r.customer_id
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

app.post('/api/resellers', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { customer_id, company_name, tax_id } = req.body || {};
    if (!customer_id || !company_name) return fail(res, 400, 'Customer & nama perusahaan wajib');
    const [r] = await pool.query(
      `INSERT INTO resellers (customer_id, company_name, tax_id, is_active) VALUES (:cid, :cn, :tax, 1)`,
      { cid: customer_id, cn: company_name, tax: tax_id || null }
    );
    return ok(res, { id: r.insertId }, 'Reseller dibuat');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Customer sudah jadi reseller');
    return fail(res, 500, e.message);
  }
});

app.put('/api/resellers/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(
      `UPDATE resellers SET company_name=:cn, tax_id=:tax, is_active=:act WHERE id=:id`,
      { id, cn: req.body.company_name, tax: req.body.tax_id, act: req.body.is_active === false ? 0 : 1 }
    );
    return ok(res, { id }, 'Reseller diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/resellers/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM resellers WHERE id=:id`, { id: Number(req.params.id) });
    return ok(res, null, 'Reseller dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* POS: create sale */
function saleNumber() {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
}

app.post('/api/sales', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      branch_id,
      customer_id,
      reseller_id,
      items,
      discount_amount,
      tax_percent,
      notes,
      payment_method,
    } = req.body || {};
    const bid = Number(branch_id || req.user.branch_id);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) {
      return fail(res, 403, 'Cabang tidak sesuai');
    }
    if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Keranjang kosong');

    let resellerCtx = false;
    let resellerRowId = null;
    if (reseller_id) {
      const [rs] = await conn.query(
        `SELECT r.id, r.is_active FROM resellers r WHERE r.id=:rid AND r.is_active=1`,
        { rid: reseller_id }
      );
      if (rs[0]) {
        resellerCtx = true;
        resellerRowId = rs[0].id;
      }
    }

    await conn.beginTransaction();
    let subtotal = 0;
    const lineRows = [];
    for (const line of items) {
      const [pr] = await conn.query(
        `SELECT id, retail_price, wholesale_price, min_wholesale_qty, is_active FROM products WHERE id=:id FOR UPDATE`,
        { id: line.product_id }
      );
      const p = pr[0];
      if (!p || !p.is_active) {
        await conn.rollback();
        return fail(res, 400, `Produk ${line.product_id} tidak tersedia`);
      }
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) {
        await conn.rollback();
        return fail(res, 400, 'Qty tidak valid');
      }
      let unit = Number(p.retail_price);
      let isWh = 0;
      if (resellerCtx && qty >= Number(p.min_wholesale_qty)) {
        unit = Number(p.wholesale_price);
        isWh = 1;
      }
      const lineSub = unit * qty;
      subtotal += lineSub;
      lineRows.push({ product_id: p.id, qty, unit, lineSub, isWh });
    }

    const disc = Number(discount_amount) || 0;
    const taxP = Number(tax_percent) || 0;
    const afterDisc = Math.max(0, subtotal - disc);
    const taxAmt = (afterDisc * taxP) / 100;
    const grand = afterDisc + taxAmt;
    const sn = saleNumber();

    const [ins] = await conn.query(
      `INSERT INTO sales (sale_number, branch_id, cashier_user_id, customer_id, reseller_id, is_wholesale_context,
        subtotal, discount_amount, tax_amount, tax_percent, grand_total, notes)
       VALUES (:sn, :bid, :uid, :cid, :rid, :iwc, :sub, :disc, :tax, :taxp, :grand, :notes)`,
      {
        sn,
        bid,
        uid: req.user.id,
        cid: customer_id || null,
        rid: resellerRowId,
        iwc: resellerCtx ? 1 : 0,
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
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_subtotal, is_wholesale_line)
         VALUES (:sid, :pid, :qty, :up, :ls, :wh)`,
        { sid: saleId, pid: lr.product_id, qty: lr.qty, up: lr.unit, ls: lr.lineSub, wh: lr.isWh }
      );
      const [sb] = await conn.query(
        `SELECT quantity FROM stock_branch WHERE branch_id=:bid AND product_id=:pid FOR UPDATE`,
        { bid, pid: lr.product_id }
      );
      if (!sb[0] || sb[0].quantity < lr.qty) {
        await conn.rollback();
        return fail(res, 400, `Stok cabang tidak cukup untuk produk ${lr.product_id}`);
      }
      await conn.query(
        `UPDATE stock_branch SET quantity = quantity - :q WHERE branch_id=:bid AND product_id=:pid`,
        { q: lr.qty, bid, pid: lr.product_id }
      );
      await conn.query(
        `INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (:bid, :pid, 'pos_sale', :d, 'sale', :sid, 'Penjualan POS', :uid)`,
        { bid, pid: lr.product_id, d: -lr.qty, sid: saleId, uid: req.user.id }
      );
    }
    await conn.query(
      `INSERT INTO payments (sale_id, method, amount) VALUES (:sid, :m, :amt)`,
      { sid: saleId, m: payment_method || 'cash', amt: grand }
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
    if (req.user.role_slug === 'karyawan') return fail(res, 403, 'Akses ditolak');
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND s.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND (s.sale_number LIKE :s OR c.name LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'grand_total', 'created_at'].includes(sort) ? `s.${sort}` : 's.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS s.*, u.full_name AS cashier_name, c.name AS customer_name, rs.company_name AS reseller_company
       FROM sales s
       JOIN users u ON u.id = s.cashier_user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN resellers rs ON rs.id = s.reseller_id
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
      `SELECT s.*, u.full_name AS cashier_name, b.name AS branch_name FROM sales s
       JOIN users u ON u.id=s.cashier_user_id JOIN branches b ON b.id=s.branch_id WHERE s.id=:id`,
      { id }
    );
    if (!s[0]) return fail(res, 404, 'Transaksi tidak ada');
    if (req.user.role_slug !== 'super_admin' && Number(s[0].branch_id) !== Number(req.user.branch_id)) {
      return fail(res, 403, 'Akses ditolak');
    }
    const [items] = await pool.query(
      `SELECT si.*, p.name AS product_name, p.sku FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=:id`,
      { id }
    );
    const [pays] = await pool.query(`SELECT * FROM payments WHERE sale_id=:id`, { id });
    return ok(res, { ...s[0], items, payments: pays }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.patch('/api/sales/:id/printed', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`UPDATE sales SET printed_at=NOW() WHERE id=:id`, { id });
    return ok(res, { id }, 'Status cetak diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Attendance */
app.get('/api/attendances', authMiddleware, async (req, res) => {
  try {
    const { page, limit, offset, search, sort, order } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug === 'karyawan') {
      const [em] = await pool.query(`SELECT id FROM employees WHERE user_id=:uid LIMIT 1`, { uid: req.user.id });
      where += ' AND a.employee_id = :eid ';
      params.eid = em[0]?.id || 0;
    } else if (req.user.role_slug !== 'super_admin') {
      where += ' AND a.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND (e.employee_code LIKE :s OR u.full_name LIKE :s) ';
      params.s = `%${search}%`;
    }
    const sortCol = ['id', 'clock_in_at', 'status'].includes(sort) ? `a.${sort}` : 'a.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS a.*, e.employee_code, u.full_name, b.name AS branch_name
       FROM attendances a
       JOIN employees e ON e.id = a.employee_id
       JOIN users u ON u.id = e.user_id
       JOIN branches b ON b.id = a.branch_id
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

app.post('/api/attendances/clock-in', authMiddleware, requireRoles('karyawan', 'admin_cabang', 'super_admin'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (latitude == null || longitude == null) return fail(res, 400, 'GPS wajib');
    const [em] = await pool.query(`SELECT e.*, b.latitude AS blat, b.longitude AS blng, b.attendance_radius_meters AS rad
       FROM employees e JOIN branches b ON b.id=e.branch_id WHERE e.user_id=:uid LIMIT 1`, { uid: req.user.id });
    const emp = em[0];
    if (!emp) return fail(res, 400, 'Data karyawan tidak ditemukan');
    const dist = distanceMeters(Number(latitude), Number(longitude), Number(emp.blat), Number(emp.blng));
    if (dist > Number(emp.rad)) {
      return fail(res, 400, `Di luar radius cabang (~${Math.round(dist)}m, max ${emp.rad}m)`);
    }
    const [open] = await pool.query(
      `SELECT id FROM attendances WHERE employee_id=:eid AND DATE(clock_in_at)=CURDATE() AND clock_out_at IS NULL`,
      { eid: emp.id }
    );
    if (open[0]) return fail(res, 400, 'Sudah clock in hari ini');
    const [br] = await pool.query(`SELECT * FROM branches WHERE id=:id`, { id: emp.branch_id });
    const workStart = new Date();
    workStart.setHours(8, 0, 0, 0);
    const lateMin = Math.max(0, Math.floor((Date.now() - workStart.getTime()) / 60000));
    const status = lateMin > 0 ? 'telat' : 'hadir';
    const [ins] = await pool.query(
      `INSERT INTO attendances (employee_id, branch_id, clock_in_at, latitude_in, longitude_in, distance_in_meters, status, late_minutes)
       VALUES (:eid, :bid, NOW(), :lat, :lng, :dist, :st, :lm)`,
      { eid: emp.id, bid: emp.branch_id, lat: latitude, lng: longitude, dist: Math.round(dist), st: status, lm: lateMin }
    );
    await logActivity(req.user.id, 'clock_in', 'attendance', ins.insertId, { dist }, req.ip);
    return ok(res, { id: ins.insertId, status, distance_in_meters: Math.round(dist) }, 'Clock in berhasil');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/attendances/clock-out', authMiddleware, requireRoles('karyawan', 'admin_cabang', 'super_admin'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (latitude == null || longitude == null) return fail(res, 400, 'GPS wajib');
    const [em] = await pool.query(`SELECT id, branch_id FROM employees WHERE user_id=:uid LIMIT 1`, { uid: req.user.id });
    const emp = em[0];
    if (!emp) return fail(res, 400, 'Karyawan tidak ditemukan');
    const [b] = await pool.query(`SELECT latitude, longitude, attendance_radius_meters AS rad FROM branches WHERE id=:id`, { id: emp.branch_id });
    const dist = distanceMeters(Number(latitude), Number(longitude), Number(b[0].latitude), Number(b[0].longitude));
    if (dist > Number(b[0].rad)) return fail(res, 400, 'Clock out di luar radius');
    const [open] = await pool.query(
      `SELECT id FROM attendances WHERE employee_id=:eid AND DATE(clock_in_at)=CURDATE() AND clock_out_at IS NULL ORDER BY id DESC LIMIT 1`,
      { eid: emp.id }
    );
    if (!open[0]) return fail(res, 400, 'Tidak ada sesi clock in aktif');
    await pool.query(
      `UPDATE attendances SET clock_out_at=NOW(), latitude_out=:lat, longitude_out=:lng WHERE id=:id`,
      { id: open[0].id, lat: latitude, lng: longitude }
    );
    return ok(res, { id: open[0].id }, 'Clock out berhasil');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Dashboard */
app.get('/api/dashboard/summary', authMiddleware, async (req, res) => {
  try {
    let branchClause = '';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      branchClause = ' AND branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    const [salesAgg] = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS revenue FROM sales WHERE 1=1 ${branchClause} AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      params
    );
    const [topProducts] = await pool.query(
      `SELECT p.name, SUM(si.quantity) AS qty FROM sale_items si
       JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE 1=1 ${branchClause} AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY p.id ORDER BY qty DESC LIMIT 5`,
      params
    );
    const [topBranches] = await pool.query(
      `SELECT b.name, COALESCE(SUM(s.grand_total),0) AS revenue FROM branches b
       LEFT JOIN sales s ON s.branch_id = b.id AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY b.id ORDER BY revenue DESC LIMIT 5`
    );
    const [lowStock] = await pool.query(
      `SELECT p.name, sb.quantity, p.min_stock, b.name AS branch_name FROM stock_branch sb
       JOIN products p ON p.id = sb.product_id JOIN branches b ON b.id = sb.branch_id
       WHERE sb.quantity <= p.min_stock ${req.user.role_slug !== 'super_admin' ? ' AND sb.branch_id = :bid2 ' : ''}
       ORDER BY sb.quantity ASC LIMIT 10`,
      req.user.role_slug !== 'super_admin' ? { bid2: req.user.branch_id } : {}
    );
    const [series] = await pool.query(
      `SELECT DATE(created_at) AS d, SUM(grand_total) AS total FROM sales WHERE 1=1 ${branchClause}
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY d`,
      params
    );
    return ok(
      res,
      {
        sales_30d: salesAgg[0],
        chart_sales: series,
        top_products: topProducts,
        top_branches: topBranches,
        low_stock: lowStock,
      },
      ''
    );
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Reports */
app.get('/api/reports/sales', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    let grp = 'DATE(s.created_at)';
    if (period === 'monthly') grp = "DATE_FORMAT(s.created_at, '%Y-%m')";
    if (period === 'yearly') grp = 'YEAR(s.created_at)';
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND s.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    const [rows] = await pool.query(
      `SELECT ${grp} AS period, COUNT(*) AS trx, SUM(s.grand_total) AS revenue, SUM(s.subtotal - (SELECT COALESCE(SUM(si.quantity * pr.hpp),0) FROM sale_items si JOIN products pr ON pr.id=si.product_id WHERE si.sale_id=s.id)) AS gross_profit_estimate
       FROM sales s ${where} GROUP BY ${grp} ORDER BY period DESC LIMIT 120`,
      params
    );
    return ok(res, rows, '', { page: 1, limit: rows.length, total: rows.length, totalPages: 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/pl', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND s.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    const [rows] = await pool.query(
      `SELECT s.id, s.sale_number, s.created_at, s.subtotal, s.discount_amount, s.tax_amount, s.grand_total,
        (SELECT COALESCE(SUM(si.quantity * pr.hpp),0) FROM sale_items si JOIN products pr ON pr.id=si.product_id WHERE si.sale_id=s.id) AS cogs
       FROM sales s ${where} ORDER BY s.id DESC LIMIT 500`,
      params
    );
    return ok(res, rows, '', { page: 1, limit: rows.length, total: rows.length, totalPages: 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/stock', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND sb.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s) ';
      params.s = `%${search}%`;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS sb.*, p.name, p.sku, p.min_stock, b.name AS branch_name, sc.quantity AS central_qty
       FROM stock_branch sb
       JOIN products p ON p.id = sb.product_id
       JOIN branches b ON b.id = sb.branch_id
       LEFT JOIN stock_central sc ON sc.product_id = p.id
       ${where}
       ORDER BY sb.quantity ASC
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/bestsellers', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND s.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS p.id, p.name, p.sku, s.branch_id, SUM(si.quantity) AS qty_sold, SUM(si.line_subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       ${where}
       GROUP BY p.id, p.name, p.sku, s.branch_id
       ORDER BY qty_sold DESC
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/reports/attendance', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { page, limit, offset, search } = parsePagination(req.query);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      where += ' AND a.branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    if (search) {
      where += ' AND u.full_name LIKE :s ';
      params.s = `%${search}%`;
    }
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS a.*, u.full_name, e.employee_code FROM attendances a
       JOIN employees e ON e.id=a.employee_id JOIN users u ON u.id=e.user_id
       ${where} ORDER BY a.clock_in_at DESC LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset }
    );
    const [[{ total }]] = await pool.query('SELECT FOUND_ROWS() as total');
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  return fail(res, 500, err.message || 'Server error');
});

app.listen(PORT, () => {
  console.log(`POS API listening on ${PORT}`);
});
