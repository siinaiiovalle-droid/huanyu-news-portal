/**
 * 后台鉴权：账号密码 + 令牌（MVP 版，后续可接入 SSO / OAuth2 / 短信登录）
 */
const crypto = require('crypto');
const { Store, genId } = require('./store');

const accounts = new Store('admins', []);
const sessions = new Map(); // token -> { userId, name, role, expireAt }
const TOKEN_TTL = 1000 * 60 * 60 * 12; // 12 小时

function hashPassword(plain, salt) {
  return crypto.createHmac('sha256', salt).update(String(plain)).digest('hex');
}

function createAccount({ username, password, name, role = 'editor' }) {
  if (accounts.findOne((a) => a.username === username)) return null;
  const salt = crypto.randomBytes(12).toString('hex');
  return accounts.insert({
    id: genId('u_'),
    username,
    name: name || username,
    role,
    salt,
    password: hashPassword(password, salt),
    status: 'active',
    lastLoginAt: null
  });
}

function verify(username, password) {
  const acc = accounts.findOne((a) => a.username === username);
  if (!acc || acc.status !== 'active') return null;
  if (hashPassword(password, acc.salt) !== acc.password) return null;
  accounts.update(acc.id, { lastLoginAt: new Date().toISOString() });
  return acc;
}

function issueToken(acc) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    userId: acc.id,
    name: acc.name,
    role: acc.role,
    username: acc.username,
    expireAt: Date.now() + TOKEN_TTL
  });
  return token;
}

function parseAuth(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const token = bearer || (req.query && req.query.token) || '';
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expireAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...s };
}

function destroy(token) {
  sessions.delete(token);
}

/** 中间件：校验后台登录态 */
function requireAuth(req, res, next) {
  const user = parseAuth(req);
  if (!user) {
    res.json({ error: '未登录或登录已过期', code: 'UNAUTHORIZED' }, 401);
    return false;
  }
  req.user = user;
  return true;
}

module.exports = { accounts, createAccount, verify, issueToken, parseAuth, destroy, requireAuth, hashPassword };
