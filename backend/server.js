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

/** Subquery join: COGS per sale (produk stok + produk kanal) */
function sqlSaleItemsCogsSubquery() {
  return `SELECT si.sale_id, SUM(si.quantity * COALESCE(pr.hpp, wcp.default_cost, 0)) AS cogs
    FROM sale_items si
    LEFT JOIN products pr ON pr.id = si.product_id
    LEFT JOIN wallet_channel_products wcp ON wcp.id = si.wallet_channel_product_id
    GROUP BY si.sale_id`;
}

/** Scalar subquery: COGS satu sale (untuk laporan per-invoice) */
function sqlSingleSaleCogsScalar() {
  return `(SELECT COALESCE(SUM(si.quantity * COALESCE(pr.hpp, wcp.default_cost, 0)), 0)
    FROM sale_items si
    LEFT JOIN products pr ON pr.id = si.product_id
    LEFT JOIN wallet_channel_products wcp ON wcp.id = si.wallet_channel_product_id
    WHERE si.sale_id = s.id)`;
}

async function isWalletChannelActive(pool, slug) {
  const s = String(slug || '')
    .toLowerCase()
    .trim()
    .slice(0, 48);
  if (!s) return false;
  const [r] = await pool.query(`SELECT 1 FROM wallet_channels WHERE slug=:s AND is_active=1 LIMIT 1`, { s });
  return !!r[0];
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

/** Buat baris employees otomatis untuk user cabang (kasir/karyawan) agar absensi bisa dipakai */
async function ensureEmployeeForAttendance(poolConn, user) {
  const [em] = await poolConn.query(
    `SELECT e.*, b.latitude AS blat, b.longitude AS blng, b.attendance_radius_meters AS rad
     FROM employees e JOIN branches b ON b.id = e.branch_id WHERE e.user_id = :uid LIMIT 1`,
    { uid: user.id }
  );
  if (em[0]) return em[0];
  const bid = user.branch_id;
  if (!bid) return null;
  const code = `AUTO-${user.id}`;
  try {
    await poolConn.query(
      `INSERT INTO employees (user_id, branch_id, employee_code, position) VALUES (:uid, :bid, :code, :pos)`,
      { uid: user.id, bid, code, pos: user.role_slug || 'staff' }
    );
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY') throw e;
  }
  const [em2] = await poolConn.query(
    `SELECT e.*, b.latitude AS blat, b.longitude AS blng, b.attendance_radius_meters AS rad
     FROM employees e JOIN branches b ON b.id = e.branch_id WHERE e.user_id = :uid LIMIT 1`,
    { uid: user.id }
  );
  return em2[0] || null;
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
    const params = { limit, offset };
    if (search) {
      where += ' AND (p.name LIKE :s OR p.sku LIKE :s OR p.barcode LIKE :s) ';
      params.s = `%${search}%`;
    }
    let stockJoin = '';
    let stockSelect = '';
    let bid = null;
    if (req.query.branch_id != null && req.query.branch_id !== '') {
      const n = Number(req.query.branch_id);
      if (!Number.isNaN(n) && n > 0) {
        if (req.user.role_slug === 'super_admin') bid = n;
        else if (Number(req.user.branch_id) === n) bid = n;
        else return fail(res, 403, 'Cabang tidak sesuai');
      }
    }
    if (bid != null) {
      stockJoin = ' LEFT JOIN stock_branch sb ON sb.product_id = p.id AND sb.branch_id = :bid ';
      stockSelect = ', COALESCE(sb.quantity, 0) AS branch_stock ';
      params.bid = bid;
    }
    const sortCol = ['id', 'name', 'sku', 'retail_price', 'created_at'].includes(sort) ? `p.${sort}` : 'p.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS p.*, c.name AS category_name, u.abbreviation AS unit_abbr,
              ROUND((p.retail_price - p.hpp) / NULLIF(p.hpp,0) * 100, 2) AS margin_percent
              ${stockSelect}
       FROM products p
       JOIN categories c ON c.id = p.category_id
       JOIN units u ON u.id = p.unit_id
       ${stockJoin}
       ${where}
       ORDER BY ${sortCol} ${order}
       LIMIT :limit OFFSET :offset`,
      params
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

/** Koreksi stok manual (tambah/kurang); tercatat di stock_mutations */
app.post('/api/stock/adjust', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { scope, branch_id, product_id, quantity_delta, notes } = req.body || {};
    const pid = Number(product_id);
    const delta = Number(quantity_delta);
    if (!pid || !Number.isFinite(delta) || delta === 0) return fail(res, 400, 'Produk & selisih qty wajib');

    await conn.beginTransaction();
    if (scope === 'central') {
      const [sc] = await conn.query(`SELECT quantity FROM stock_central WHERE product_id=:pid FOR UPDATE`, { pid });
      if (!sc[0]) {
        await conn.rollback();
        return fail(res, 404, 'Stok pusat untuk produk ini belum ada');
      }
      const next = Number(sc[0].quantity) + delta;
      if (next < 0) {
        await conn.rollback();
        return fail(res, 400, 'Stok tidak boleh negatif');
      }
      await conn.query(`UPDATE stock_central SET quantity=:q WHERE product_id=:pid`, { q: next, pid });
      await conn.query(
        `INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (NULL, :pid, 'adjustment', :d, 'manual_adjust', NULL, :n, :uid)`,
        { pid, d: delta, n: (notes && String(notes).slice(0, 250)) || null, uid: req.user.id }
      );
    } else if (scope === 'branch') {
      const bid = Number(branch_id);
      if (!bid) {
        await conn.rollback();
        return fail(res, 400, 'branch_id wajib untuk stok cabang');
      }
      if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) {
        await conn.rollback();
        return fail(res, 403, 'Hanya bisa menyesuaikan stok cabang sendiri');
      }
      const [sb] = await conn.query(
        `SELECT quantity FROM stock_branch WHERE branch_id=:bid AND product_id=:pid FOR UPDATE`,
        { bid, pid }
      );
      if (!sb[0]) {
        if (delta < 0) {
          await conn.rollback();
          return fail(res, 400, 'Stok cabang belum ada untuk produk ini');
        }
        await conn.query(`INSERT INTO stock_branch (branch_id, product_id, quantity) VALUES (:bid, :pid, :q)`, {
          bid,
          pid,
          q: delta,
        });
      } else {
        const next = Number(sb[0].quantity) + delta;
        if (next < 0) {
          await conn.rollback();
          return fail(res, 400, 'Stok tidak boleh negatif');
        }
        await conn.query(`UPDATE stock_branch SET quantity=:q WHERE branch_id=:bid AND product_id=:pid`, { q: next, bid, pid });
      }
      await conn.query(
        `INSERT INTO stock_mutations (branch_id, product_id, mutation_type, quantity_delta, ref_type, ref_id, notes, created_by)
         VALUES (:bid, :pid, 'adjustment', :d, 'manual_adjust', NULL, :n, :uid)`,
        { bid, pid, d: delta, n: (notes && String(notes).slice(0, 250)) || null, uid: req.user.id }
      );
    } else {
      await conn.rollback();
      return fail(res, 400, 'scope harus "central" atau "branch"');
    }
    await conn.commit();
    return ok(res, { ok: true }, 'Stok diperbarui');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
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
    const sortCol = ['id', 'status', 'created_at', 'transfer_date'].includes(sort) ? `st.${sort}` : 'st.id';
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
    const [t] = await pool.query(
      `SELECT st.*, b.name AS to_branch_name FROM stock_transfers st
       JOIN branches b ON b.id = st.to_branch_id WHERE st.id=:id`,
      { id }
    );
    if (!t[0]) return fail(res, 404, 'Transfer tidak ada');
    const canSee =
      req.user.role_slug === 'super_admin' ||
      Number(t[0].to_branch_id) === Number(req.user.branch_id) ||
      Number(t[0].requested_by) === Number(req.user.id);
    if (!canSee) return fail(res, 403, 'Akses ditolak');
    const [items] = await pool.query(
      `SELECT sti.*, p.name, p.sku FROM stock_transfer_items sti JOIN products p ON p.id = sti.product_id WHERE sti.transfer_id=:id`,
      { id }
    );
    return ok(res, { ...t[0], items }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/stock-transfers', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { to_branch_id, items, notes, transfer_date: tdRaw } = req.body || {};
    if (!to_branch_id || !Array.isArray(items) || !items.length) return fail(res, 400, 'Item transfer wajib');
    let transferDate = (tdRaw || '').toString().trim().slice(0, 10);
    if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) {
      transferDate = new Date().toISOString().slice(0, 10);
    }
    const from_source = 'central';
    const toBid = Number(to_branch_id);
    if (req.user.role_slug === 'kasir') {
      if (!req.user.branch_id || Number(req.user.branch_id) !== toBid) {
        return fail(res, 403, 'Kasir hanya boleh mengajukan minta stok untuk cabang sendiri');
      }
    } else if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== toBid) {
      return fail(res, 403, 'Admin hanya boleh request ke cabang sendiri');
    }
    const normalized = [];
    for (const it of items) {
      const pid = Number(it.product_id);
      const qty = Number(it.quantity);
      if (!pid || !Number.isFinite(qty) || qty < 1) return fail(res, 400, 'Setiap item wajib punya produk & qty minimal 1');
      normalized.push({ product_id: pid, quantity: Math.floor(qty) });
    }
    const num = `TRF-${Date.now()}`;
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO stock_transfers (transfer_number, from_source, from_branch_id, to_branch_id, transfer_date, status, requested_by, notes)
       VALUES (:num, :fs, NULL, :toBid, :tdate, 'pending', :uid, :notes)`,
      { num, fs: from_source, toBid, tdate: transferDate, uid: req.user.id, notes: notes || null }
    );
    const tid = ins.insertId;
    for (const it of normalized) {
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
    const [items] = await conn.query(
      `SELECT sti.*, p.sku, p.name AS product_name FROM stock_transfer_items sti
       JOIN products p ON p.id = sti.product_id WHERE sti.transfer_id=:id`,
      { id }
    );
    await conn.beginTransaction();
    for (const it of items) {
      const [sc] = await conn.query(`SELECT quantity FROM stock_central WHERE product_id=:pid FOR UPDATE`, { pid: it.product_id });
      if (!sc[0] || sc[0].quantity < it.quantity) {
        await conn.rollback();
        const label = it.product_name || it.sku || `ID ${it.product_id}`;
        return fail(res, 400, `Stok pusat tidak cukup untuk ${label} (minta ${it.quantity}, tersedia ${sc[0]?.quantity ?? 0})`);
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
      where += ' AND (r.company_name LIKE :s OR c.phone LIKE :s OR c.address LIKE :s) ';
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

app.post('/api/resellers', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  const { customer_id, company_name, tax_id, phone, address } = req.body || {};
  const cn = (company_name || '').toString().trim();
  if (!cn) return fail(res, 400, 'Nama perusahaan wajib');
  const conn = await pool.getConnection();
  try {
    const tax = tax_id != null && tax_id !== '' ? String(tax_id).trim() : null;
    let cid = customer_id != null && customer_id !== '' ? Number(customer_id) : null;
    if (cid && Number.isNaN(cid)) cid = null;

    await conn.beginTransaction();
    if (cid) {
      const [dup] = await conn.query(`SELECT id FROM resellers WHERE customer_id=:cid`, { cid });
      if (dup.length) {
        await conn.rollback();
        return fail(res, 400, 'Customer sudah jadi reseller');
      }
      const [r] = await conn.query(
        `INSERT INTO resellers (customer_id, company_name, tax_id, is_active) VALUES (:cid, :cn, :tax, 1)`,
        { cid, cn, tax }
      );
      await conn.commit();
      return ok(res, { id: r.insertId }, 'Reseller dibuat');
    }
    const ph = (phone || '').toString().trim();
    const addr = (address || '').toString().trim();
    if (!ph) {
      await conn.rollback();
      return fail(res, 400, 'No HP wajib');
    }
    if (!addr) {
      await conn.rollback();
      return fail(res, 400, 'Alamat wajib');
    }
    let bid = null;
    if (!(req.user.role_slug === 'super_admin' && (req.user.branch_id == null || req.user.branch_id === ''))) {
      bid = Number(req.user.branch_id);
    }
    const code = `CUST-${Date.now()}`;
    const [custIns] = await conn.query(
      `INSERT INTO customers (branch_id, code, name, phone, address, is_active) VALUES (:bid, :code, :name, :phone, :addr, 1)`,
      { bid, code, name: cn, phone: ph, addr }
    );
    const newCid = custIns.insertId;
    await conn.query(`INSERT INTO memberships (customer_id, tier, points) VALUES (:cid, 'bronze', 0)`, { cid: newCid });
    const [rIns] = await conn.query(
      `INSERT INTO resellers (customer_id, company_name, tax_id, is_active) VALUES (:cid, :cn, :tax, 1)`,
      { cid: newCid, cn, tax }
    );
    await conn.commit();
    return ok(res, { id: rIns.insertId }, 'Reseller dibuat');
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Data duplikat / customer sudah reseller');
    return fail(res, 500, e.message);
  } finally {
    conn.release();
  }
});

app.put('/api/resellers/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  const id = Number(req.params.id);
  const cn = (req.body.company_name || '').toString().trim();
  const ph = (req.body.phone || '').toString().trim();
  const addr = (req.body.address || '').toString().trim();
  if (!cn) return fail(res, 400, 'Nama perusahaan wajib');
  if (!ph) return fail(res, 400, 'No HP wajib');
  if (!addr) return fail(res, 400, 'Alamat wajib');
  const conn = await pool.getConnection();
  try {
    const tax = req.body.tax_id != null && req.body.tax_id !== '' ? String(req.body.tax_id).trim() : null;
    const act = req.body.is_active === false || req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1;
    await conn.beginTransaction();
    await conn.query(`UPDATE resellers SET company_name=:cn, tax_id=:tax, is_active=:act WHERE id=:id`, { id, cn, tax, act });
    await conn.query(
      `UPDATE customers c INNER JOIN resellers r ON r.customer_id = c.id
       SET c.name=:nm, c.phone=:ph, c.address=:ad WHERE r.id=:id`,
      { id, nm: cn, ph, ad: addr }
    );
    await conn.commit();
    return ok(res, { id }, 'Reseller diperbarui');
  } catch (e) {
    await conn.rollback();
    return fail(res, 500, e.message);
  } finally {
    conn.release();
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

/* Wallet channels (master kanal) + produk kanal */
app.get('/api/wallet-channels', authMiddleware, async (req, res) => {
  try {
    const activeOnly = req.query.active_only === '1' || req.query.active_only === 'true';
    let sql = 'SELECT id, slug, label, sort_order, is_active FROM wallet_channels WHERE 1=1';
    if (activeOnly) sql += ' AND is_active=1';
    if (req.user.role_slug === 'kasir' || req.user.role_slug === 'karyawan') sql += ' AND is_active=1';
    sql += ' ORDER BY sort_order ASC, id ASC';
    const [rows] = await pool.query(sql);
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/wallet-channels', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const slug = String(req.body.slug || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '');
    const label = String(req.body.label || '').trim();
    const sort_order = Number(req.body.sort_order) || 0;
    if (!slug || !label) return fail(res, 400, 'Slug (a-z, angka, _) dan label wajib');
    if (slug.length < 2) return fail(res, 400, 'Slug minimal 2 karakter');
    const [ins] = await pool.query(
      `INSERT INTO wallet_channels (slug, label, sort_order, is_active) VALUES (:slug, :label, :so, 1)`,
      { slug, label, so: sort_order }
    );
    return ok(res, { id: ins.insertId, slug, label }, 'Kanal dibuat');
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return fail(res, 400, 'Slug sudah dipakai');
    return fail(res, 500, e.message);
  }
});

app.put('/api/wallet-channels/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const label = String(req.body.label || '').trim();
    const sort_order = req.body.sort_order != null ? Number(req.body.sort_order) : null;
    const is_active = req.body.is_active === false || req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1;
    if (!label) return fail(res, 400, 'Label wajib');
    await pool.query(
      `UPDATE wallet_channels SET label=:label, sort_order=COALESCE(:so, sort_order), is_active=:ia WHERE id=:id`,
      { id, label, so: sort_order, ia: is_active }
    );
    return ok(res, { id }, 'Kanal diperbarui');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/api/wallet-channel-products', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const channelId = req.query.channel_id != null && req.query.channel_id !== '' ? Number(req.query.channel_id) : null;
    const slug = String(req.query.channel_slug || '')
      .toLowerCase()
      .trim()
      .slice(0, 48);
    let where = ' WHERE 1=1 ';
    const params = {};
    if (channelId) {
      where += ' AND wcp.channel_id = :cid ';
      params.cid = channelId;
    } else if (slug) {
      where += ' AND wc.slug = :slug ';
      params.slug = slug;
    }
    if (req.query.active_only === '1' || req.query.active_only === 'true') where += ' AND wcp.is_active=1 ';
    const [rows] = await pool.query(
      `SELECT wcp.*, wc.slug AS channel_slug, wc.label AS channel_label
       FROM wallet_channel_products wcp
       JOIN wallet_channels wc ON wc.id = wcp.channel_id
       ${where}
       ORDER BY wcp.name ASC`,
      params
    );
    return ok(res, rows, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/wallet-channel-products', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const channel_id = Number(req.body.channel_id);
    const name = String(req.body.name || '').trim();
    const default_cost = Number(req.body.default_cost) || 0;
    const default_sale_price = Number(req.body.default_sale_price) || 0;
    if (!channel_id || !name) return fail(res, 400, 'Kanal & nama wajib');
    const [ch] = await pool.query(`SELECT id FROM wallet_channels WHERE id=:id LIMIT 1`, { id: channel_id });
    if (!ch[0]) return fail(res, 400, 'Kanal tidak ada');
    const [ins] = await pool.query(
      `INSERT INTO wallet_channel_products (channel_id, name, default_cost, default_sale_price, is_active)
       VALUES (:cid, :name, :dc, :dsp, 1)`,
      { cid: channel_id, name, dc: default_cost, dsp: default_sale_price }
    );
    return ok(res, { id: ins.insertId }, 'Produk kanal dibuat');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/api/wallet-channel-products/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const default_cost = req.body.default_cost != null ? Number(req.body.default_cost) : null;
    const default_sale_price = req.body.default_sale_price != null ? Number(req.body.default_sale_price) : null;
    const is_active = req.body.is_active === false || req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1;
    if (!name) return fail(res, 400, 'Nama wajib');
    await pool.query(
      `UPDATE wallet_channel_products SET name=:name,
        default_cost = COALESCE(:dc, default_cost),
        default_sale_price = COALESCE(:dsp, default_sale_price),
        is_active=:ia
       WHERE id=:id`,
      { id, name, dc: default_cost, dsp: default_sale_price, ia: is_active }
    );
    return ok(res, { id }, 'Produk kanal diperbarui');
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
      wallet_channel,
    } = req.body || {};
    const bid = Number(branch_id || req.user.branch_id);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) {
      return fail(res, 403, 'Cabang tidak sesuai');
    }
    if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Keranjang kosong');

    const hasWalletLineInput = items.some((ln) => {
      const w = ln.wallet_channel_product_id;
      return w != null && String(w).trim() !== '' && !Number.isNaN(Number(w));
    });
    let resellerCtx = false;
    let resellerRowId = null;
    if (reseller_id && !hasWalletLineInput) {
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
    const wcRaw = wallet_channel ? String(wallet_channel).toLowerCase().trim().slice(0, 48) : '';
    let wcResolved = null;
    if (wcRaw) {
      const okCh = await isWalletChannelActive(conn, wcRaw);
      if (!okCh) {
        await conn.rollback();
        return fail(res, 400, 'Kanal aplikasi tidak valid atau nonaktif');
      }
      wcResolved = wcRaw;
    }

    let subtotal = 0;
    const lineRows = [];
    let hasStock = false;
    let hasWallet = false;

    for (const line of items) {
      const wid =
        line.wallet_channel_product_id != null && line.wallet_channel_product_id !== ''
          ? Number(line.wallet_channel_product_id)
          : null;
      const pid = line.product_id != null && line.product_id !== '' ? Number(line.product_id) : null;
      if (wid && pid) {
        await conn.rollback();
        return fail(res, 400, 'Satu baris hanya produk stok atau produk kanal');
      }
      if (!wid && !pid) {
        await conn.rollback();
        return fail(res, 400, 'Baris keranjang tidak valid');
      }

      if (wid) {
        hasWallet = true;
        const [wrows] = await conn.query(
          `SELECT wcp.id, wcp.name, wcp.default_cost, wcp.default_sale_price, wcp.is_active, wc.slug AS channel_slug
           FROM wallet_channel_products wcp
           JOIN wallet_channels wc ON wc.id = wcp.channel_id
           WHERE wcp.id=:id FOR UPDATE`,
          { id: wid }
        );
        const wcp = wrows[0];
        if (!wcp || !wcp.is_active) {
          await conn.rollback();
          return fail(res, 400, `Produk kanal tidak tersedia`);
        }
        if (!wcResolved || wcp.channel_slug !== wcResolved) {
          await conn.rollback();
          return fail(res, 400, 'Produk kanal harus sesuai kanal yang dipilih di POS');
        }
        const qty = Number(line.quantity) || 0;
        if (qty <= 0) {
          await conn.rollback();
          return fail(res, 400, 'Qty tidak valid');
        }
        let unit =
          line.unit_price != null && line.unit_price !== '' ? Number(line.unit_price) : Number(wcp.default_sale_price);
        if (Number.isNaN(unit) || unit < 0) {
          await conn.rollback();
          return fail(res, 400, 'Harga jual tidak valid');
        }
        const lineSub = unit * qty;
        subtotal += lineSub;
        lineRows.push({ kind: 'wallet', wallet_channel_product_id: wcp.id, qty, unit, lineSub, isWh: 0 });
      } else {
        hasStock = true;
        const [pr] = await conn.query(
          `SELECT id, retail_price, wholesale_price, min_wholesale_qty, is_active FROM products WHERE id=:id FOR UPDATE`,
          { id: pid }
        );
        const p = pr[0];
        if (!p || !p.is_active) {
          await conn.rollback();
          return fail(res, 400, `Produk ${pid} tidak tersedia`);
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
        lineRows.push({ kind: 'stock', product_id: p.id, qty, unit, lineSub, isWh });
      }
    }

    if (hasStock && hasWallet) {
      await conn.rollback();
      return fail(res, 400, 'Campuran produk stok dan produk kanal tidak diperbolehkan');
    }
    if (hasWallet && !wcResolved) {
      await conn.rollback();
      return fail(res, 400, 'Pilih kanal aplikasi untuk penjualan produk kanal');
    }
    if (hasStock && wcResolved) {
      await conn.rollback();
      return fail(res, 400, 'Penjualan stok cabang: kosongkan kanal saldo aplikasi');
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
      if (lr.kind === 'wallet') {
        await conn.query(
          `INSERT INTO sale_items (sale_id, product_id, wallet_channel_product_id, quantity, unit_price, line_subtotal, is_wholesale_line)
           VALUES (:sid, NULL, :wcpid, :qty, :up, :ls, :wh)`,
          { sid: saleId, wcpid: lr.wallet_channel_product_id, qty: lr.qty, up: lr.unit, ls: lr.lineSub, wh: lr.isWh }
        );
      } else {
        await conn.query(
          `INSERT INTO sale_items (sale_id, product_id, wallet_channel_product_id, quantity, unit_price, line_subtotal, is_wholesale_line)
           VALUES (:sid, :pid, NULL, :qty, :up, :ls, :wh)`,
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
    }
    const wc = wcResolved;
    await conn.query(
      `INSERT INTO payments (sale_id, method, wallet_channel, amount) VALUES (:sid, :m, :wc, :amt)`,
      { sid: saleId, m: payment_method || 'cash', amt: grand, wc }
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
    if (req.query.wallet_sale === '1' || req.query.wallet_sale === 'true') {
      where += ` AND EXISTS (
        SELECT 1 FROM payments pw WHERE pw.sale_id = s.id
        AND pw.wallet_channel IS NOT NULL AND pw.wallet_channel != ''
      ) `;
    }
    const sortCol = ['id', 'grand_total', 'created_at'].includes(sort) ? `s.${sort}` : 's.id';
    const [rows] = await pool.query(
      `SELECT SQL_CALC_FOUND_ROWS s.*, u.full_name AS cashier_name, c.name AS customer_name, rs.company_name AS reseller_company,
        pay.wallet_channel AS wallet_channel
       FROM sales s
       JOIN users u ON u.id = s.cashier_user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN resellers rs ON rs.id = s.reseller_id
       LEFT JOIN payments pay ON pay.sale_id = s.id AND pay.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
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
      `SELECT si.*,
        COALESCE(p.name, wcp.name) AS product_name,
        COALESCE(p.sku, '') AS sku,
        COALESCE(p.hpp, wcp.default_cost) AS hpp
       FROM sale_items si
       LEFT JOIN products p ON p.id = si.product_id
       LEFT JOIN wallet_channel_products wcp ON wcp.id = si.wallet_channel_product_id
       WHERE si.sale_id=:id`,
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
    if (req.user.role_slug === 'karyawan' || req.user.role_slug === 'kasir') {
      await ensureEmployeeForAttendance(pool, req.user);
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

app.post('/api/attendances/clock-in', authMiddleware, requireRoles('karyawan', 'kasir', 'admin_cabang', 'super_admin'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (latitude == null || longitude == null) return fail(res, 400, 'GPS wajib');
    let emp = await ensureEmployeeForAttendance(pool, req.user);
    if (!emp) return fail(res, 400, 'Akun tidak terikat cabang; hubungi admin untuk data karyawan');
    const dist = distanceMeters(Number(latitude), Number(longitude), Number(emp.blat), Number(emp.blng));
    if (dist > Number(emp.rad)) {
      return fail(res, 400, `Di luar radius cabang (~${Math.round(dist)}m, max ${emp.rad}m)`);
    }
    const [open] = await pool.query(
      `SELECT id FROM attendances WHERE employee_id=:eid AND DATE(clock_in_at)=CURDATE() AND clock_out_at IS NULL`,
      { eid: emp.id }
    );
    if (open[0]) return fail(res, 400, 'Sudah clock in hari ini');
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

app.post('/api/attendances/clock-out', authMiddleware, requireRoles('karyawan', 'kasir', 'admin_cabang', 'super_admin'), async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (latitude == null || longitude == null) return fail(res, 400, 'GPS wajib');
    let emp = await ensureEmployeeForAttendance(pool, req.user);
    if (!emp) return fail(res, 400, 'Akun tidak terikat cabang; hubungi admin untuk data karyawan');
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
    const staffToday = req.user.role_slug === 'kasir' || req.user.role_slug === 'karyawan';
    let branchClause = '';
    const params = {};
    if (req.user.role_slug !== 'super_admin') {
      branchClause = ' AND branch_id = :bid ';
      params.bid = req.user.branch_id;
    }
    const salesDateClause = staffToday ? ' AND DATE(created_at) = CURDATE() ' : ' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ';
    const [salesAgg] = await pool.query(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total),0) AS revenue FROM sales WHERE 1=1 ${branchClause} ${salesDateClause}`,
      params
    );
    const [topProducts] = await pool.query(
      `SELECT p.name, SUM(si.quantity) AS qty FROM sale_items si
       JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE 1=1 ${branchClause} ${salesDateClause.replace('created_at', 's.created_at')}
       GROUP BY p.id ORDER BY qty DESC LIMIT 5`,
      params
    );
    let topBranches;
    if (staffToday && req.user.branch_id) {
      const [tb] = await pool.query(
        `SELECT b.name, COALESCE(SUM(s.grand_total),0) AS revenue FROM branches b
         LEFT JOIN sales s ON s.branch_id = b.id AND DATE(s.created_at) = CURDATE()
         WHERE b.id = :bid GROUP BY b.id, b.name`,
        { bid: req.user.branch_id }
      );
      topBranches = tb;
    } else {
      const [tb] = await pool.query(
        `SELECT b.name, COALESCE(SUM(s.grand_total),0) AS revenue FROM branches b
         LEFT JOIN sales s ON s.branch_id = b.id AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY b.id ORDER BY revenue DESC LIMIT 5`
      );
      topBranches = tb;
    }
    const [lowStock] = await pool.query(
      `SELECT p.name, sb.quantity, p.min_stock, b.name AS branch_name FROM stock_branch sb
       JOIN products p ON p.id = sb.product_id JOIN branches b ON b.id = sb.branch_id
       WHERE sb.quantity <= p.min_stock ${req.user.role_slug !== 'super_admin' ? ' AND sb.branch_id = :bid2 ' : ''}
       ORDER BY sb.quantity ASC LIMIT 10`,
      req.user.role_slug !== 'super_admin' ? { bid2: req.user.branch_id } : {}
    );
    let series;
    if (staffToday) {
      const [hr] = await pool.query(
        `SELECT HOUR(created_at) AS h, SUM(grand_total) AS total FROM sales WHERE 1=1 ${branchClause}
         AND DATE(created_at) = CURDATE() GROUP BY HOUR(created_at) ORDER BY h`,
        params
      );
      series = hr;
    } else {
      const [s2] = await pool.query(
        `SELECT DATE(created_at) AS d, SUM(grand_total) AS total FROM sales WHERE 1=1 ${branchClause}
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY d`,
        params
      );
      series = s2;
    }
    const omsetBranch = req.user.role_slug !== 'super_admin' ? ' AND s.branch_id = :bidOm ' : '';
    const omsetParams = req.user.role_slug !== 'super_admin' ? { bidOm: req.user.branch_id } : {};
    const [todayOmsetRows] = await pool.query(
      `SELECT
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'simpel' THEN s.grand_total ELSE 0 END) AS omset_simpel,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'digipos' THEN s.grand_total ELSE 0 END) AS omset_digipos,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'bonafit' THEN s.grand_total ELSE 0 END) AS omset_bonafit,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) NOT IN ('simpel','digipos','bonafit') AND p.wallet_channel IS NOT NULL AND p.wallet_channel != '' THEN s.grand_total ELSE 0 END) AS omset_wallet_lain,
        SUM(CASE WHEN (p.wallet_channel IS NULL OR p.wallet_channel = '') AND s.is_wholesale_context = 1 THEN s.grand_total ELSE 0 END) AS omset_grosiran,
        SUM(CASE WHEN (p.wallet_channel IS NULL OR p.wallet_channel = '') AND s.is_wholesale_context = 0 THEN s.grand_total ELSE 0 END) AS omset_penjualan,
        COUNT(DISTINCT s.id) AS trx_count,
        COALESCE(SUM(s.grand_total), 0) AS total_omset,
        COALESCE(SUM(s.grand_total - IFNULL(c.cogs, 0)), 0) AS net_profit
      FROM sales s
      LEFT JOIN payments p ON p.sale_id = s.id AND p.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
      LEFT JOIN (
        ${sqlSaleItemsCogsSubquery()}
      ) c ON c.sale_id = s.id
      WHERE DATE(s.created_at) = CURDATE() ${omsetBranch}`,
      omsetParams
    );
    const tom = todayOmsetRows[0] || {};
    const today_omset = {
      penjualan: Number(tom.omset_penjualan) || 0,
      grosiran: Number(tom.omset_grosiran) || 0,
      simpel: Number(tom.omset_simpel) || 0,
      digipos: Number(tom.omset_digipos) || 0,
      bonafit: Number(tom.omset_bonafit) || 0,
      wallet_lain: Number(tom.omset_wallet_lain) || 0,
      total_omset: Number(tom.total_omset) || 0,
      trx_count: Number(tom.trx_count) || 0,
      net_profit: Number(tom.net_profit) || 0,
    };
    return ok(
      res,
      {
        scope: staffToday ? 'staff_today' : 'default',
        sales_30d: salesAgg[0],
        chart_sales: series,
        top_products: topProducts,
        top_branches: topBranches,
        low_stock: lowStock,
        today_omset,
      },
      ''
    );
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Laporan harian operator + saldo kanal (Simpel / Digipos / Bonafit) */
app.get('/api/reports/daily-shift', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const date = (req.query.date || '').toString().slice(0, 10) || new Date().toISOString().slice(0, 10);
    let bid = req.query.branch_id != null ? Number(req.query.branch_id) : Number(req.user.branch_id);
    if (req.user.role_slug !== 'super_admin') bid = Number(req.user.branch_id);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Cabang tidak sesuai');

    const base = { bid, d: date };
    const [grosir] = await pool.query(
      `SELECT si.quantity, si.unit_price, si.line_subtotal, p.name AS product_name, p.sku, p.hpp,
              s.sale_number, c.phone AS customer_phone
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.branch_id = :bid AND DATE(s.created_at) = :d AND s.is_wholesale_context = 1
       ORDER BY s.id, si.id`,
      base
    );

    const [channelDefs] = await pool.query(
      `SELECT slug, label FROM wallet_channels WHERE is_active=1 ORDER BY sort_order ASC, id ASC`
    );
    const channels = {};
    for (const def of channelDefs) {
      const ch = def.slug;
      const [lines] = await pool.query(
        `SELECT si.quantity, si.unit_price, si.line_subtotal,
          COALESCE(p.name, wcp.name) AS product_name, COALESCE(p.sku, '') AS sku,
          COALESCE(p.hpp, wcp.default_cost) AS hpp,
          s.sale_number, c.phone AS customer_phone
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         INNER JOIN payments pay ON pay.sale_id = s.id AND LOWER(pay.wallet_channel) = LOWER(:ch)
         LEFT JOIN products p ON p.id = si.product_id
         LEFT JOIN wallet_channel_products wcp ON wcp.id = si.wallet_channel_product_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.branch_id = :bid AND DATE(s.created_at) = :d
         ORDER BY s.id, si.id`,
        { ...base, ch }
      );
      const [manualRows] = await pool.query(
        `SELECT id, customer_phone, description, cost_amount, sale_amount
         FROM wallet_manual_lines WHERE branch_id = :bid AND line_date = :d AND channel = :ch
         ORDER BY id`,
        { ...base, ch }
      );
      const posLines = lines.map((row) => ({ ...row, source: 'pos' }));
      const manualLines = manualRows.map((m) => ({
        source: 'manual',
        manual_line_id: m.id,
        quantity: 1,
        unit_price: Number(m.sale_amount),
        line_subtotal: Number(m.sale_amount),
        product_name: m.description,
        sku: '',
        hpp: Number(m.cost_amount),
        customer_phone: m.customer_phone,
        sale_number: null,
      }));
      const posJual = lines.reduce((acc, row) => acc + Number(row.line_subtotal || 0), 0);
      const posModal = lines.reduce((acc, row) => acc + Number(row.hpp || 0) * Number(row.quantity || 0), 0);
      const manJual = manualLines.reduce((a, row) => a + Number(row.line_subtotal || 0), 0);
      const manModal = manualLines.reduce((a, row) => a + Number(row.hpp || 0) * Number(row.quantity || 0), 0);
      const [topupRows] = await pool.query(
        `SELECT id, amount, notes, created_at FROM wallet_topup_lines WHERE branch_id = :bid AND topup_date = :d AND channel = :ch ORDER BY id`,
        { ...base, ch }
      );
      const total_topup = topupRows.reduce((a, r) => a + Number(r.amount || 0), 0);
      channels[ch] = {
        lines: [...posLines, ...manualLines],
        total_jual: posJual + manJual,
        total_modal: posModal + manModal,
        topups: topupRows,
        total_topup,
      };
    }

    const [snaps] = await pool.query(
      `SELECT channel, opening_balance, closing_balance, notes FROM wallet_daily_snapshots WHERE branch_id = :bid AND snapshot_date = :d`,
      base
    );
    const snapshots = {};
    for (const s of snaps) snapshots[s.channel] = s;

    const grosir_total = grosir.reduce((a, r) => a + Number(r.line_subtotal || 0), 0);

    return ok(
      res,
      {
        date,
        branch_id: bid,
        grosir,
        grosir_total,
        channel_defs: channelDefs,
        channels,
        snapshots,
      },
      ''
    );
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/api/wallet-snapshots', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const { branch_id, snapshot_date, channel, opening_balance, closing_balance, notes } = req.body || {};
    const bid = Number(branch_id);
    const d = (snapshot_date || '').toString().slice(0, 10);
    const ch = (channel || '').toString().toLowerCase();
    if (!bid || !d || !ch) return fail(res, 400, 'branch_id, snapshot_date, channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const ob = opening_balance != null && opening_balance !== '' ? Number(opening_balance) : 0;
    const cb = closing_balance != null && closing_balance !== '' ? Number(closing_balance) : null;
    await pool.query(
      `INSERT INTO wallet_daily_snapshots (branch_id, snapshot_date, channel, opening_balance, closing_balance, notes, created_by)
       VALUES (:bid, :d, :ch, :ob, :cb, :notes, :uid)
       ON DUPLICATE KEY UPDATE opening_balance = VALUES(opening_balance), closing_balance = VALUES(closing_balance), notes = VALUES(notes), created_by = VALUES(created_by)`,
      { bid, d, ch, ob, cb, notes: notes || null, uid: req.user.id }
    );
    return ok(res, { ok: true }, 'Saldo harian disimpan');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

function resolveBranchIdForWallet(req, bodyBranchId) {
  let bid = bodyBranchId != null ? Number(bodyBranchId) : Number(req.user.branch_id);
  if (req.user.role_slug !== 'super_admin') bid = Number(req.user.branch_id);
  return bid;
}

function resolveBranchIdForWalletQuery(req) {
  let bid =
    req.query.branch_id != null && req.query.branch_id !== '' ? Number(req.query.branch_id) : Number(req.user.branch_id);
  if (req.user.role_slug !== 'super_admin') bid = Number(req.user.branch_id);
  return bid;
}

/** Cabang untuk rekap saldo kanal: super_admin wajib ?branch_id= */
function resolveBranchIdForBalanceReport(req) {
  if (req.user.role_slug === 'super_admin') {
    const q = req.query.branch_id;
    if (q == null || q === '' || Number(q) <= 0) return 0;
    return Number(q);
  }
  return Number(req.user.branch_id) || 0;
}

/* Daftar baris manual saldo kanal (untuk POS / rekonsiliasi) */
app.get('/api/wallet-manual-lines', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const bid = resolveBranchIdForWalletQuery(req);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    if (req.user.role_slug === 'kasir' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const d = (req.query.line_date || '').toString().slice(0, 10) || new Date().toISOString().slice(0, 10);
    const ch = (req.query.channel || '').toString().toLowerCase();
    if (!ch) return fail(res, 400, 'channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const [rows] = await pool.query(
      `SELECT id, branch_id, line_date, channel, customer_phone, description, cost_amount, sale_amount, created_at
       FROM wallet_manual_lines WHERE branch_id = :bid AND line_date = :d AND channel = :ch ORDER BY id`,
      { bid, d, ch }
    );
    const total_modal = rows.reduce((a, r) => a + Number(r.cost_amount || 0), 0);
    const total_sale = rows.reduce((a, r) => a + Number(r.sale_amount || 0), 0);
    return ok(res, { lines: rows, total_modal, total_sale, profit: total_sale - total_modal }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Baris manual saldo kanal (keterangan bebas + modal + harga jual) */
app.post('/api/wallet-manual-lines', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const { branch_id, line_date, channel, customer_phone, description, cost_amount, sale_amount } = req.body || {};
    const bid = resolveBranchIdForWallet(req, branch_id);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    if (req.user.role_slug === 'kasir' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const d = (line_date || '').toString().slice(0, 10);
    const ch = (channel || '').toString().toLowerCase();
    if (!d || !ch) return fail(res, 400, 'Tanggal & channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const desc = (description || '').toString().trim();
    if (!desc) return fail(res, 400, 'Keterangan wajib');
    const cost = Number(cost_amount);
    const sale = Number(sale_amount);
    if (Number.isNaN(cost) || cost < 0) return fail(res, 400, 'Modal tidak valid');
    if (Number.isNaN(sale) || sale < 0) return fail(res, 400, 'Harga jual tidak valid');
    const phone = customer_phone != null && String(customer_phone).trim() !== '' ? String(customer_phone).trim().slice(0, 32) : null;
    const [ins] = await pool.query(
      `INSERT INTO wallet_manual_lines (branch_id, line_date, channel, customer_phone, description, cost_amount, sale_amount, created_by)
       VALUES (:bid, :d, :ch, :phone, :desc, :cost, :sale, :uid)`,
      { bid, d, ch, phone, desc, cost, sale, uid: req.user.id }
    );
    return ok(res, { id: ins.insertId }, 'Baris ditambahkan');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/wallet-manual-lines/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT branch_id FROM wallet_manual_lines WHERE id = :id`, { id });
    if (!rows.length) return fail(res, 404, 'Baris tidak ditemukan');
    const bid = rows[0].branch_id;
    if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Tidak diizinkan');
    await pool.query(`DELETE FROM wallet_manual_lines WHERE id = :id`, { id });
    return ok(res, null, 'Baris dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/* Saldo masuk (top-up) per kanal — tidak memakai master produk / stok */
app.get('/api/wallet-topups', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const bid = resolveBranchIdForWalletQuery(req);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    if (req.user.role_slug === 'kasir' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const d = (req.query.topup_date || '').toString().slice(0, 10) || new Date().toISOString().slice(0, 10);
    const ch = (req.query.channel || '').toString().toLowerCase();
    if (!ch) return fail(res, 400, 'channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const [rows] = await pool.query(
      `SELECT id, branch_id, topup_date, channel, amount, notes, created_at
       FROM wallet_topup_lines WHERE branch_id = :bid AND topup_date = :d AND channel = :ch ORDER BY id`,
      { bid, d, ch }
    );
    const total_topup = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    return ok(res, { lines: rows, total_topup }, '');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/api/wallet-topups', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const { branch_id, topup_date, channel, amount, notes } = req.body || {};
    const bid = resolveBranchIdForWallet(req, branch_id);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    if (req.user.role_slug === 'kasir' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const d = (topup_date || '').toString().slice(0, 10);
    const ch = (channel || '').toString().toLowerCase();
    if (!d || !ch) return fail(res, 400, 'Tanggal & channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const amt = Number(amount);
    if (Number.isNaN(amt) || amt <= 0) return fail(res, 400, 'Nominal saldo masuk harus lebih dari 0');
    const n = notes != null && String(notes).trim() !== '' ? String(notes).trim().slice(0, 255) : null;
    const [ins] = await pool.query(
      `INSERT INTO wallet_topup_lines (branch_id, topup_date, channel, amount, notes, created_by) VALUES (:bid, :d, :ch, :amt, :notes, :uid)`,
      { bid, d, ch, amt, notes: n, uid: req.user.id }
    );
    return ok(res, { id: ins.insertId }, 'Saldo masuk tercatat');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.delete('/api/wallet-topups/:id', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT branch_id FROM wallet_topup_lines WHERE id = :id`, { id });
    if (!rows.length) return fail(res, 404, 'Baris tidak ditemukan');
    const bid = rows[0].branch_id;
    if (req.user.role_slug !== 'super_admin' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Tidak diizinkan');
    await pool.query(`DELETE FROM wallet_topup_lines WHERE id = :id`, { id });
    return ok(res, null, 'Baris dihapus');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/** Rekap saldo kanal per cabang: masuk (top-up) vs keluar (estimasi modal manual + penjualan produk kanal) */
app.get('/api/wallet-branch-balance/summary', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const bid = resolveBranchIdForBalanceReport(req);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const ch = (req.query.channel || '').toString().toLowerCase().trim().slice(0, 48);
    if (!ch) return fail(res, 400, 'channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const from = (req.query.from || '').toString().trim().slice(0, 10);
    const to = (req.query.to || '').toString().trim().slice(0, 10);
    const useRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
    const params = { bid, ch };
    if (useRange) {
      params.from = from;
      params.to = to;
    }
    const dateTop = useRange ? ' AND wtl.topup_date BETWEEN :from AND :to ' : '';
    const dateMan = useRange ? ' AND wml.line_date BETWEEN :from AND :to ' : '';
    const dateSale = useRange ? ' AND DATE(s.created_at) BETWEEN :from AND :to ' : '';
    const [top] = await pool.query(
      `SELECT COALESCE(SUM(wtl.amount), 0) AS t
       FROM wallet_topup_lines wtl
       WHERE wtl.branch_id = :bid AND LOWER(wtl.channel) = LOWER(:ch) ${dateTop}`,
      params
    );
    const [man] = await pool.query(
      `SELECT COALESCE(SUM(wml.cost_amount), 0) AS t
       FROM wallet_manual_lines wml
       WHERE wml.branch_id = :bid AND LOWER(wml.channel) = LOWER(:ch) ${dateMan}`,
      params
    );
    const [saleCogs] = await pool.query(
      `SELECT COALESCE(SUM(si.quantity * wcp.default_cost), 0) AS t
       FROM sale_items si
       INNER JOIN wallet_channel_products wcp ON wcp.id = si.wallet_channel_product_id
       INNER JOIN sales s ON s.id = si.sale_id
       WHERE s.branch_id = :bid ${dateSale}
       AND EXISTS (
         SELECT 1 FROM payments p
         WHERE p.sale_id = s.id AND LOWER(p.wallet_channel) = LOWER(:ch)
         AND p.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
       )`,
      params
    );
    const total_topup = Number(top[0]?.t) || 0;
    const total_manual_modal = Number(man[0]?.t) || 0;
    const total_sale_modal = Number(saleCogs[0]?.t) || 0;
    const total_out = total_manual_modal + total_sale_modal;
    const balance_estimate = total_topup - total_out;
    const [br] = await pool.query(`SELECT name FROM branches WHERE id = :bid LIMIT 1`, { bid });
    return ok(
      res,
      {
        branch_id: bid,
        branch_name: br[0]?.name || '',
        channel: ch,
        date_from: useRange ? from : null,
        date_to: useRange ? to : null,
        total_topup,
        total_manual_modal,
        total_sale_modal,
        total_out,
        balance_estimate,
      },
      ''
    );
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/** Riwayat aktivitas saldo kanal per cabang (top-up, manual, penjualan produk kanal) */
app.get('/api/wallet-branch-balance/activity', authMiddleware, requireRoles('super_admin', 'admin_cabang'), async (req, res) => {
  try {
    const bid = resolveBranchIdForBalanceReport(req);
    if (!bid) return fail(res, 400, 'Cabang wajib');
    if (req.user.role_slug === 'admin_cabang' && Number(req.user.branch_id) !== bid) return fail(res, 403, 'Hanya cabang sendiri');
    const ch = (req.query.channel || '').toString().toLowerCase().trim().slice(0, 48);
    if (!ch) return fail(res, 400, 'channel wajib');
    if (!(await isWalletChannelActive(pool, ch))) return fail(res, 400, 'Channel tidak valid atau nonaktif');
    const { page, limit, offset } = parsePagination(req.query);
    const from = (req.query.from || '').toString().trim().slice(0, 10);
    const to = (req.query.to || '').toString().trim().slice(0, 10);
    const useRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
    const params = { bid, ch, limit, offset };
    if (useRange) {
      params.from = from;
      params.to = to;
    }
    const dateTop = useRange ? ' AND wtl.topup_date BETWEEN :from AND :to ' : '';
    const dateMan = useRange ? ' AND wml.line_date BETWEEN :from AND :to ' : '';
    const dateSale = useRange ? ' AND DATE(s.created_at) BETWEEN :from AND :to ' : '';
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (
        SELECT wtl.id AS rid FROM wallet_topup_lines wtl
        WHERE wtl.branch_id = :bid AND LOWER(wtl.channel) = LOWER(:ch) ${dateTop}
        UNION ALL
        SELECT wml.id FROM wallet_manual_lines wml
        WHERE wml.branch_id = :bid AND LOWER(wml.channel) = LOWER(:ch) ${dateMan}
        UNION ALL
        SELECT s.id FROM sales s
        WHERE s.branch_id = :bid ${dateSale}
        AND EXISTS (
          SELECT 1 FROM payments p WHERE p.sale_id = s.id AND LOWER(p.wallet_channel) = LOWER(:ch)
          AND p.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
        )
        AND EXISTS (
          SELECT 1 FROM sale_items si0 WHERE si0.sale_id = s.id AND si0.wallet_channel_product_id IS NOT NULL
        )
        AND (
          SELECT COALESCE(SUM(si1.quantity * wcp1.default_cost), 0) FROM sale_items si1
          INNER JOIN wallet_channel_products wcp1 ON wcp1.id = si1.wallet_channel_product_id
          WHERE si1.sale_id = s.id
        ) > 0
      ) x`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM (
        SELECT 'topup' AS kind, wtl.id AS ref_id, wtl.created_at AS sort_ts, wtl.topup_date AS ref_date,
          CONCAT('Saldo masuk (TF/isi)', IF(IFNULL(wtl.notes,'') <> '', CONCAT(' — ', wtl.notes), '')) AS description,
          wtl.amount AS amount_in, CAST(0 AS DECIMAL(14,2)) AS amount_out, NULL AS sale_id
        FROM wallet_topup_lines wtl
        WHERE wtl.branch_id = :bid AND LOWER(wtl.channel) = LOWER(:ch) ${dateTop}
        UNION ALL
        SELECT 'manual', wml.id, wml.created_at, wml.line_date,
          CONCAT('Manual: ', wml.description),
          0, wml.cost_amount, NULL
        FROM wallet_manual_lines wml
        WHERE wml.branch_id = :bid AND LOWER(wml.channel) = LOWER(:ch) ${dateMan}
        UNION ALL
        SELECT 'sale', s.id, s.created_at, DATE(s.created_at),
          CONCAT('Penjualan ', s.sale_number, ' (est. potong saldo aplikasi)'),
          CAST(0 AS DECIMAL(14,2)),
          (
            SELECT COALESCE(SUM(si2.quantity * wcp2.default_cost), 0) FROM sale_items si2
            INNER JOIN wallet_channel_products wcp2 ON wcp2.id = si2.wallet_channel_product_id
            WHERE si2.sale_id = s.id
          ) AS amount_out,
          s.id
        FROM sales s
        WHERE s.branch_id = :bid ${dateSale}
        AND EXISTS (
          SELECT 1 FROM payments p WHERE p.sale_id = s.id AND LOWER(p.wallet_channel) = LOWER(:ch)
          AND p.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
        )
        AND EXISTS (
          SELECT 1 FROM sale_items si3 WHERE si3.sale_id = s.id AND si3.wallet_channel_product_id IS NOT NULL
        )
        HAVING amount_out > 0
      ) u
      ORDER BY sort_ts DESC, ref_id DESC
      LIMIT :limit OFFSET :offset`,
      params
    );
    return ok(res, rows, '', { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

/** Omset harian per kanal (ecer / grosir / wallet) + laba bersih estimasi (grand_total − COGS) */
app.get('/api/reports/daily-omset', authMiddleware, requireRoles('super_admin', 'admin_cabang', 'kasir'), async (req, res) => {
  try {
    let from = (req.query.from || '').toString().trim().slice(0, 10);
    let to = (req.query.to || '').toString().trim().slice(0, 10);
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const t = new Date();
      to = t.toISOString().slice(0, 10);
      const u = new Date(t);
      u.setUTCDate(u.getUTCDate() - 29);
      from = u.toISOString().slice(0, 10);
    }
    if (from > to) return fail(res, 400, 'Tanggal mulai tidak boleh setelah tanggal akhir');

    let branchId = req.query.branch_id != null && req.query.branch_id !== '' ? Number(req.query.branch_id) : null;
    let cashierUid = req.query.cashier_user_id != null && req.query.cashier_user_id !== '' ? Number(req.query.cashier_user_id) : null;

    if (req.user.role_slug === 'kasir' || req.user.role_slug === 'karyawan') {
      branchId = Number(req.user.branch_id);
      cashierUid = Number(req.user.id);
    } else if (req.user.role_slug === 'admin_cabang') {
      branchId = Number(req.user.branch_id);
      if (cashierUid) {
        const [cu] = await pool.query(
          `SELECT u.id FROM users u WHERE u.id=:id AND u.branch_id=:bid`,
          { id: cashierUid, bid: branchId }
        );
        if (!cu.length) cashierUid = null;
      }
    }

    let where = ' WHERE DATE(s.created_at) BETWEEN :from AND :to ';
    const qparams = { from, to };
    if (branchId) {
      where += ' AND s.branch_id = :bid ';
      qparams.bid = branchId;
    }
    if (cashierUid) {
      where += ' AND s.cashier_user_id = :cid ';
      qparams.cid = cashierUid;
    }

    const [rows] = await pool.query(
      `SELECT DATE(s.created_at) AS report_date,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'simpel' THEN s.grand_total ELSE 0 END) AS omset_simpel,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'digipos' THEN s.grand_total ELSE 0 END) AS omset_digipos,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) = 'bonafit' THEN s.grand_total ELSE 0 END) AS omset_bonafit,
        SUM(CASE WHEN LOWER(IFNULL(p.wallet_channel,'')) NOT IN ('simpel','digipos','bonafit') AND p.wallet_channel IS NOT NULL AND p.wallet_channel != '' THEN s.grand_total ELSE 0 END) AS omset_wallet_lain,
        SUM(CASE WHEN (p.wallet_channel IS NULL OR p.wallet_channel = '') AND s.is_wholesale_context = 1 THEN s.grand_total ELSE 0 END) AS omset_grosiran,
        SUM(CASE WHEN (p.wallet_channel IS NULL OR p.wallet_channel = '') AND s.is_wholesale_context = 0 THEN s.grand_total ELSE 0 END) AS omset_penjualan,
        COUNT(DISTINCT s.id) AS trx_count,
        COALESCE(SUM(s.grand_total), 0) AS total_omset,
        COALESCE(SUM(s.grand_total - IFNULL(c.cogs, 0)), 0) AS net_profit
      FROM sales s
      LEFT JOIN payments p ON p.sale_id = s.id AND p.id = (SELECT MIN(p2.id) FROM payments p2 WHERE p2.sale_id = s.id)
      LEFT JOIN (
        ${sqlSaleItemsCogsSubquery()}
      ) c ON c.sale_id = s.id
      ${where}
      GROUP BY DATE(s.created_at)
      ORDER BY report_date ASC`,
      qparams
    );

    let branches = [];
    if (req.user.role_slug === 'super_admin') {
      const [br] = await pool.query(`SELECT id, code, name FROM branches ORDER BY name`);
      branches = br;
    } else if (req.user.branch_id) {
      const [br] = await pool.query(`SELECT id, code, name FROM branches WHERE id=:id`, { id: req.user.branch_id });
      branches = br;
    }

    let cashiers = [];
    if (req.user.role_slug === 'kasir' || req.user.role_slug === 'karyawan') {
      cashiers = [{ id: req.user.id, full_name: req.user.full_name || 'Saya' }];
    } else if (req.user.role_slug === 'admin_cabang' && branchId) {
      const [cx] = await pool.query(
        `SELECT u.id, u.full_name FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.branch_id = :bid AND r.slug IN ('kasir','karyawan','admin_cabang')
         ORDER BY u.full_name`,
        { bid: branchId }
      );
      cashiers = cx;
    } else if (req.user.role_slug === 'super_admin') {
      const cparams = {};
      let cwhere = " WHERE r.slug IN ('kasir','karyawan','admin_cabang') ";
      if (branchId) {
        cwhere += ' AND u.branch_id = :bid ';
        cparams.bid = branchId;
      }
      const [cx] = await pool.query(
        `SELECT u.id, u.full_name, u.branch_id FROM users u
         JOIN roles r ON r.id = u.role_id
         ${cwhere}
         ORDER BY u.full_name LIMIT 300`,
        cparams
      );
      cashiers = cx;
    }

    return ok(res, { rows, branches, cashiers }, '');
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
      `SELECT ${grp} AS period, COUNT(*) AS trx, SUM(s.grand_total) AS revenue, SUM(s.subtotal - ${sqlSingleSaleCogsScalar()}) AS gross_profit_estimate
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
        ${sqlSingleSaleCogsScalar()} AS cogs
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
      `SELECT SQL_CALC_FOUND_ROWS p.id, p.name, p.sku, s.branch_id, b.name AS branch_name, SUM(si.quantity) AS qty_sold, SUM(si.line_subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       JOIN branches b ON b.id = s.branch_id
       ${where}
       GROUP BY p.id, p.name, p.sku, s.branch_id, b.name
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
      `SELECT SQL_CALC_FOUND_ROWS a.*, u.full_name, e.employee_code, b.name AS branch_name
       FROM attendances a
       JOIN employees e ON e.id=a.employee_id
       JOIN users u ON u.id=e.user_id
       JOIN branches b ON b.id=a.branch_id
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
