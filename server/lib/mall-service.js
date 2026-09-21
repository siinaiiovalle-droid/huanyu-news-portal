/**
 * 寰宇严选 —— 商城业务服务
 *
 * 与新闻主业同源思路：商品也是"内容"，由买手货架 + 编辑推荐位驱动。
 * 数据落 data/mall.json（商品）与 data/orders.json（订单），
 * MVP 走 store.js 文件持久层，后续可替换数据库而不用改上层 API。
 *
 * 配图策略：商品图用真实高清实拍图（scripts/fetch-mall-images.js 下载到
 * public/img/mall/），读数据时校验文件是否真的存在，缺失或没下载过的图位一律
 * 回退 /api/v1/placeholder 主题渐变 SVG —— 所以离线环境、图没下全也不会出现破图。
 */
const fs = require('fs');
const path = require('path');
const { Store, genId, nowISO } = require('./store');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

/* ------------------------------ 配图兜底 ------------------------------ */

/**
 * 只采用真实落在 public/ 下的图：数据里写了 /img/mall/xxx.jpg 但文件被删了，
 * 直接输出就成了破图，所以读取时校验一次，缺了交回占位图。
 */
function localImage(link) {
  if (!link || typeof link !== 'string' || !link.startsWith('/img/')) return '';
  try {
    return fs.existsSync(path.join(PUBLIC_DIR, link)) ? link : '';
  } catch {
    return '';
  }
}

/** 主题渐变占位图：真实图缺失时的兜底 */
function placeholderOf(p, w, h, text) {
  return `/api/v1/placeholder?w=${w}&h=${h}&text=${encodeURIComponent(text || '')}&theme=${p && p.theme ? p.theme : 'blue'}`;
}

/* ------------------------------ 数据仓储 ------------------------------ */

const products = new Store('mall', SEED_PRODUCTS());
const orders = new Store('orders', []);

/* ------------------------------ 类目 ------------------------------ */

const CATEGORIES = [
  { id: 'all', name: '全部好物', icon: '✦', desc: '买手严选 · 编辑推荐' },
  { id: 'digital', name: '数码影音', icon: '🎧', desc: '耳机 · 影像 · 智能穿戴' },
  { id: 'culture', name: '图书文创', icon: '📚', desc: '出版读物 · 新闻周边' },
  { id: 'home', name: '家居生活', icon: '🛋️', desc: '收纳 · 厨房 · 香氛' },
  { id: 'food', name: '健康食品', icon: '🍵', desc: '茶饮 · 谷物 · 轻食' },
  { id: 'sports', name: '运动户外', icon: '🏕️', desc: '露营 · 健身 · 通勤' },
  { id: 'beauty', name: '美妆个护', icon: '🧴', desc: '护肤 · 清洁 · 护理' }
];

/* ------------------------------ 展示编排 ------------------------------ */

/** 首页轮播：结合站点口号的品牌楼层 */
const BANNERS = [
  {
    id: 'b1',
    tag: '寰宇严选 · 开业季',
    title: '看见世界，也把好物带回家',
    desc: '首批 24 件买手选品全部通过编辑部试用，正品直营，全国包邮',
    cta: '立即逛逛',
    theme: 'blue',
    link: '#goods'
  },
  {
    id: 'b2',
    tag: '限时秒杀',
    title: '每天 10 点 · 四件好物限时抢',
    desc: '先到先得，售完即止，秒杀价最低 5 折起',
    cta: '查看秒杀',
    theme: 'rose',
    link: '#seckill'
  },
  {
    id: 'b3',
    tag: '会员权益',
    title: '下单即享会员价与 7 天无理由',
    desc: '媒体级品控，假一赔十，物流异常由客服先行赔付',
    cta: '了解保障',
    theme: 'amber',
    link: '#promise'
  }
];

/** 服务保障：把"媒体监督"做成信任背书，区别于普通电商 */
const PROMISES = [
  { icon: '🛡️', title: '正品保障', desc: '品牌直供 · 假一赔十' },
  { icon: '↩️', title: '7 天无理由', desc: '不喜欢随时退' },
  { icon: '🚚', title: '极速发货', desc: '当日 18 点前出库' },
  { icon: '📰', title: '媒体监督', desc: '编辑部全程品控' }
];

/* ------------------------------ 商品数据 ------------------------------ */

function goods({ n, title, subtitle, category, price, originalPrice, theme, tag, sales = 0, rating = 4.8, highlights = [], specs = [], desc = '', mediaStyle }) {
  const id = `g${String(n).padStart(3, '0')}`;
  return {
    id,
    title,
    subtitle,
    category,
    price,
    originalPrice,
    // 折扣与节省额在读取时现算，避免数据里的价格口径不一致
    tag: tag || '',
    theme,
    cover: `/api/v1/placeholder?w=600&h=600&text=${encodeURIComponent(title.slice(0, 8))}&theme=${theme}`,
    gallery: [
      `/api/v1/placeholder?w=900&h=900&text=${encodeURIComponent(title.slice(0, 8))}&theme=${theme}`,
      `/api/v1/placeholder?w=900&h=900&text=${encodeURIComponent('细节 · 材质')}&theme=${theme}`,
      `/api/v1/placeholder?w=900&h=900&text=${encodeURIComponent('场景 · 实拍')}&theme=${mediaStyle || theme}`
    ],
    sales,
    rating,
    stock: 50 + ((n * 37) % 200),
    highlights,
    specs,
    desc,
    createdAt: new Date(Date.now() - (n % 20) * 86400000).toISOString()
  };
}

function SEED_PRODUCTS() {
  return [
    /* ---- 数码影音 ---- */
    goods({
      n: 1, category: 'digital', theme: 'indigo', tag: '编辑部同款',
      title: '寰宇声学 主动降噪耳机 Pro', subtitle: '45dB 深度降噪 · 通透模式 · 42 小时续航',
      price: 799, originalPrice: 1099, sales: 3862, rating: 4.9,
      highlights: ['双馈降噪', 'LDAC 无损传输', '佩戴感应自动暂停'],
      specs: [['单元', '40mm 镀钛振膜'], ['续航', '降噪开 42h'], ['充电', 'USB-C 快充 10 分钟听 5 小时'], ['重量', '268g']],
      desc: '编辑部出差标配：飞机与地铁上的低频噪声衰减明显，开放式通透模式不用摘耳机也能听清播报。'
    }),
    goods({
      n: 2, category: 'digital', theme: 'slate', tag: '热销',
      title: '云图 便携式蓝牙音箱 Mini', subtitle: 'IPX7 防水 · 360° 环绕 · 24 小时播放',
      price: 299, originalPrice: 429, sales: 5240, rating: 4.7,
      highlights: ['IPX7 防水', '低音增强算法', '支持两台串联'],
      specs: [['功率', '20W 双单元'], ['防护', 'IPX7'], ['续航', '24h'], ['重量', '620g']],
      desc: '露营与厨房都能放，低音算法让步子更实，两台串联可做立体声。'
    }),
    goods({
      n: 3, category: 'digital', theme: 'cyan',
      title: '晨雾 高清智能摄像头 2K', subtitle: '云台全景 · 夜视增强 · 本地存储',
      price: 349, originalPrice: 499, sales: 1876, rating: 4.6,
      highlights: ['360° 云台', '星光级夜视', '支持本地 TF 卡'],
      specs: [['分辨率', '2K'], ['视野', '水平 360°'], ['存储', 'TF 卡 / 云端'], ['网络', '2.4G Wi-Fi']],
      desc: '值守家中或店面够用了，隐私遮蔽与本地存储可按需关闭云端。'
    }),
    goods({
      n: 4, category: 'digital', theme: 'violet', tag: '新品',
      title: '行者 运动智能手表 X2', subtitle: '双频 GPS · 血氧心率 · 14 天续航',
      price: 1099, originalPrice: 1399, sales: 942, rating: 4.8,
      highlights: ['双频定位', '全天血氧', '50 米防水'],
      specs: [['屏幕', '1.43" AMOLED'], ['续航', '典型 14 天'], ['防水', '5ATM'], ['运动', '150+ 模式']],
      desc: '跑步轨迹在城市峡谷里仍稳，双频 GPS 修正明显，日常监测项够全。'
    }),

    /* ---- 图书文创 ---- */
    goods({
      n: 5, category: 'culture', theme: 'gold', tag: '编辑推荐',
      title: '《看见世界》新闻摄影集', subtitle: '十年现场摄影精选 · 精装函套',
      price: 168, originalPrice: 228, sales: 2170, rating: 4.9,
      highlights: ['176 幅现场照片', '摄影手记附册', '精装锁线'],
      specs: [['开本', '12 开'], ['页数', '312'], ['装帧', '精装函套'], ['出版', '寰宇出版中心']],
      desc: '从突发现场到日常角落，每一帧都配了记者的拍摄手记，是本会让人安静下来的书。'
    }),
    goods({
      n: 6, category: 'culture', theme: 'amber',
      title: '记者手账本 · 第四版', subtitle: '100g 进口纸 · 不洇墨 · 可平摊',
      price: 69, originalPrice: 89, sales: 6128, rating: 4.8,
      highlights: ['180° 平摊', '100g 书写纸', '便携 A5'],
      specs: [['开本', 'A5'], ['内页', '192 页'], ['纸质', '100g 米白'], ['装订', '线缝精装']],
      desc: '采访本改到第四版：钢笔也不洇，摊开能一直写，封面耐脏。'
    }),
    goods({
      n: 7, category: 'culture', theme: 'orange',
      title: '地球仪 · 夜灯两用摆件', subtitle: '中英文双语地名 · 触控三色暖光',
      price: 259, originalPrice: 359, sales: 1354, rating: 4.7,
      highlights: ['触控三色', '双语地名', 'Type-C 供电'],
      specs: [['直径', '20cm'], ['光源', '三色暖光'], ['供电', 'Type-C'], ['材质', 'ABS + 金属架']],
      desc: '书桌上的小地球，夜里当灯，白天当摆件，孩子认地名也顺手。'
    }),
    goods({
      n: 8, category: 'culture', theme: 'purple',
      title: '城市记忆 · 手绘明信片套装', subtitle: '12 城风貌 · 含邮票位 · 收藏卡盒',
      price: 39, originalPrice: 59, sales: 8430, rating: 4.6,
      highlights: ['12 张手绘', '300g 荷兰白卡', '卡盒收纳'],
      specs: [['张数', '12'], ['克重', '300g'], ['尺寸', '100×148mm'], ['包装', '硬卡盒']],
      desc: '十二座城市的手绘街景，写完寄出去，剩下的夹在书里当书签。'
    }),

    /* ---- 家居生活 ---- */
    goods({
      n: 9, category: 'home', theme: 'teal',
      title: '轻氧 桌面香薰加湿器', subtitle: '静音 28dB · 无雾款可选 · 4 小时断电',
      price: 199, originalPrice: 279, sales: 2461, rating: 4.7,
      highlights: ['28dB 静音', '缺水断电', '两种雾量'],
      specs: [['容量', '500ml'], ['噪音', '28dB'], ['续航', '12h'], ['灯', '七色夜灯']],
      desc: '夜里几乎听不见，雾量细不打湿桌面，加几滴精油就是香薰机。'
    }),
    goods({
      n: 10, category: 'home', theme: 'green',
      title: '晨光 真空保温杯 500ml', subtitle: '316 内胆 · 12 小时保温 · 一键弹盖',
      price: 129, originalPrice: 189, sales: 9215, rating: 4.8,
      highlights: ['316 不锈钢', '12h 保温', '单手开合'],
      specs: [['容量', '500ml'], ['材质', '316 内胆'], ['保温', '12 小时'], ['密封', '硅胶圈防漏']],
      desc: '通勤编辑人手一个：早上灌的热水到傍晚还是热的，包里倒着也不漏。'
    }),
    goods({
      n: 11, category: 'home', theme: 'sky', tag: '回购王',
      title: '云朵 抗菌擦手巾 6 条装', subtitle: 'A 类婴幼儿标准 · 速干不发黏',
      price: 49, originalPrice: 79, sales: 15620, rating: 4.9,
      highlights: ['A 类标准', '30 秒速干', '6 条分色'],
      specs: [['规格', '6 条装'], ['材质', '超细纤维'], ['尺寸', '30×30cm'], ['等级', 'A 类']],
      desc: '回购率最高的一款：擦手擦桌都能用，洗完干得快，不容易有味。'
    }),
    goods({
      n: 12, category: 'home', theme: 'slate',
      title: '折叠收纳箱 · 三件套', subtitle: '免安装 · 前后双开口 · 可视化窗',
      price: 89, originalPrice: 129, sales: 3327, rating: 4.5,
      highlights: ['免安装折叠', '前后双开', '透视窗'],
      specs: [['规格', '三件套'], ['容量', '45L / 30L / 18L'], ['材质', 'PP + 牛津布'], ['承重', '25kg']],
      desc: '不去量尺寸也能塞进柜子，正面开窗，找东西不用全倒出来。'
    }),

    /* ---- 健康食品 ---- */
    goods({
      n: 13, category: 'food', theme: 'green', tag: '产地直发',
      title: '云雾山 明前绿茶 100g', subtitle: '明前头采 · 兰香回甘 · 罐装锁鲜',
      price: 128, originalPrice: 168, sales: 4182, rating: 4.8,
      highlights: ['明前头采', '氮气锁鲜', '铝罐包装'],
      specs: [['净含量', '100g'], ['采摘', '明前'], ['包装', '氮气铝罐'], ['保存', '冷藏更佳']],
      desc: '办公室工位上的常备：豆香明显，回甘快，耐泡三四道不出水味。'
    }),
    goods({
      n: 14, category: 'food', theme: 'amber',
      title: '田野 混合谷物代餐 30 包', subtitle: '低温烘焙 · 无额外添加糖 · 30 天装',
      price: 79, originalPrice: 119, sales: 7834, rating: 4.6,
      highlights: ['低温烘焙', '独立小包', '高膳食纤维'],
      specs: [['规格', '30 包'], ['配料', '燕麦 / 藜麦 / 坚果'], ['纳糖', '无额外添加糖'], ['保质期', '12 个月']],
      desc: '早八人的早餐：热水一冲两分钟，坚果给得实在，不齁甜。'
    }),
    goods({
      n: 15, category: 'food', theme: 'rose',
      title: '果子日记 冻干水果脆 6 罐', subtitle: '整果冻干 · 无添加 · 六种口味',
      price: 59, originalPrice: 89, sales: 10240, rating: 4.7,
      highlights: ['整果冻干', '无白砂糖', '六种口味'],
      specs: [['规格', '6 罐'], ['工艺', '-40℃ 冻干'], ['配料', '水果'], ['净含量', '18g×6']],
      desc: '开会时的小零嘴：草莓和芒果最好吃，孩子也愿意当零食。'
    }),
    goods({
      n: 16, category: 'food', theme: 'gold', tag: '礼盒装',
      title: '暖冬礼盒 · 坚果 Mac 组合', subtitle: '8 种坚果 · 独立小袋 · 送礼自留皆宜',
      price: 199, originalPrice: 299, sales: 2960, rating: 4.8,
      highlights: ['8 种坚果', '15 天份包装', '礼袋随行'],
      specs: [['规格', '1000g'], ['品种', '8 种'], ['包装', '独立小袋'], ['附赠', '手提礼袋']],
      desc: '过节走亲访友不出错的一款，独立小袋控制量，不容易受潮。'
    }),

    /* ---- 运动户外 ---- */
    goods({
      n: 17, category: 'sports', theme: 'cyan',
      title: '远山 露营折叠桌 铝合金', subtitle: '蛋卷桌面 · 承重 30kg · 收纳 60cm',
      price: 429, originalPrice: 599, sales: 1180, rating: 4.7,
      highlights: ['蛋卷折叠', '承重 30kg', '配收纳袋'],
      specs: [['展开', '70×70×40cm'], ['收纳', '60×18cm'], ['材质', '铝合金 + 竹木'], ['承重', '30kg']],
      desc: '后备箱塞得下，展开稳当不晃，桌面竹木比铝板好打理。'
    }),
    goods({
      n: 18, category: 'sports', theme: 'indigo',
      title: '轻风 防晒凉感外套', subtitle: 'UPF50+ · 凉感纱线 · 拇指扣设计',
      price: 179, originalPrice: 259, sales: 5621, rating: 4.6,
      highlights: ['UPF50+', '接触凉感', '拇指扣'],
      specs: [['防晒', 'UPF50+'], ['面料', '锦纶凉感'], ['尺码', 'S–3XL'], ['重量', '138g']],
      desc: '夏天骑车通勤穿它：太阳直射不闷，洗完挂一晚就干。'
    }),
    goods({
      n: 19, category: 'sports', theme: 'violet', tag: '新品',
      title: '静默 瑜伽垫 TPE 双面防滑', subtitle: '6mm 回弹 · 体位线 · 附绑带',
      price: 139, originalPrice: 199, sales: 2044, rating: 4.8,
      highlights: ['6mm 回弹', '双面防滑', '体位线'],
      specs: [['厚度', '6mm'], ['尺寸', '185×80cm'], ['材质', 'TPE'], ['附赠', '绑带 + 收纳袋']],
      desc: '在家跟练够用：跪姿不硌膝，出汗也不打滑，收纳体积还行。'
    }),
    goods({
      n: 20, category: 'sports', theme: 'teal',
      title: '通勤双肩包 22L · 防盗款', subtitle: '隐藏拉链 · 独立电脑仓 · 防泼水',
      price: 259, originalPrice: 359, sales: 3776, rating: 4.7,
      highlights: ['隐藏式拉链', '16" 电脑仓', '防泼水面料'],
      specs: [['容量', '22L'], ['电脑仓', '16 英寸'], ['面料', '防泼水涤纶'], ['重量', '780g']],
      desc: '出差装两台设备还有余量，主拉链贴背那一侧，挤地铁更安心。'
    }),

    /* ---- 美妆个护 ---- */
    goods({
      n: 21, category: 'beauty', theme: 'rose', tag: '回购王',
      title: '晨光 氨基酸洁面乳 120g', subtitle: '弱酸性 · 无皂基 · 洗后不紧绷',
      price: 89, originalPrice: 129, sales: 7218, rating: 4.8,
      highlights: ['氨基酸表活', '弱酸性 pH5.5', '无香精'],
      specs: [['容量', '120g'], ['表活', '氨基酸'], ['pH', '5.5 弱酸'], ['适用', '混合 / 敏感']],
      desc: '换季不闹脾气的一款：泡沫细，冲得干净，洗完没有拉丝感。'
    }),
    goods({
      n: 22, category: 'beauty', theme: 'sky',
      title: '修复 神经酰胺面霜 50g', subtitle: '屏障修护 · 不闷痘 · 四季可用',
      price: 169, originalPrice: 229, sales: 4310, rating: 4.7,
      highlights: ['三重神经酰胺', '无酒精色素', '清爽不黏'],
      specs: [['容量', '50g'], ['核心', '神经酰胺复合物'], ['质地', '乳霜'], ['适用', '干性 / 屏障受损']],
      desc: '夜里厚敷一层，第二天脱皮明显好转，后续上妆也不搓泥。'
    }),
    goods({
      n: 23, category: 'beauty', theme: 'purple',
      title: '净澈 电动牙刷 Sonic 2', subtitle: '38000 次/分 · IPX7 · 45 天续航',
      price: 249, originalPrice: 349, sales: 5133, rating: 4.6,
      highlights: ['磁悬浮马达', 'IPX7 防水', '45 天续航'],
      specs: [['振动', '38000 次/分'], ['模式', '3 档 + 抛光'], ['防水', 'IPX7'], ['续航', '45 天']],
      desc: '比同价位静一些，牙龈敏感用轻柔档也不出血，出差忘带充电器也撑得住。'
    }),
    goods({
      n: 24, category: 'beauty', theme: 'green',
      title: '草本 头皮舒缓洗发水 500ml', subtitle: '无硅油 · 控油蓬松 · 清爽草本味',
      price: 79, originalPrice: 109, sales: 6880, rating: 4.6,
      highlights: ['无硅油', '氨基酸复配', '清爽草本'],
      specs: [['容量', '500ml'], ['配方', '无硅油'], ['适用', '油性 / 细软'], ['香型', '草本柑橘']],
      desc: '油头救星：洗完蓬松度能撑到第二天下午，味道干净不刺鼻。'
    })
  ];
}

/* ------------------------------ 对外方法 ------------------------------ */

function listCategories() {
  const all = products.all();
  return CATEGORIES.map((c) => {
    const pool = c.id === 'all' ? all : all.filter((p) => p.category === c.id);
    return { ...c, count: pool.length };
  });
}

/** 折扣率（小数），用于角标与"已省"计算 */
function discountOf(p) {
  if (!p.originalPrice || p.originalPrice <= p.price) return 0;
  return Math.round((1 - p.price / p.originalPrice) * 100) / 100;
}

function decorate(p) {
  const discount = discountOf(p);
  const cat = CATEGORIES.find((c) => c.id === p.category);
  const gallery = Array.isArray(p.gallery) ? p.gallery : [];
  const ph = (w, h, text) => placeholderOf(p, w, h, text);
  const name = String(p.title || '').slice(0, 8);
  return {
    ...p,
    discount,
    saved: Math.max(0, (p.originalPrice || p.price) - p.price),
    categoryName: cat ? cat.name : p.category,
    categoryIcon: cat ? cat.icon : '',
    // 真实高清图优先，缺一个图位就补对应含义的占位图，页面永远不破图
    cover: localImage(p.cover) || ph(600, 600, name),
    gallery: [
      localImage(gallery[0]) || ph(900, 900, name),
      localImage(gallery[1]) || ph(900, 900, '细节 · 材质'),
      localImage(gallery[2]) || ph(900, 900, '场景 · 实拍')
    ]
  };
}

function listProducts({ category = '', keyword = '', sort = 'recommend', page = 1, pageSize = 12, tag = '' } = {}) {
  let pool = products.all().slice();
  if (category && category !== 'all') pool = pool.filter((p) => p.category === category);
  if (tag) pool = pool.filter((p) => (p.tag || '') === tag);
  if (keyword) {
    const k = String(keyword).trim().toLowerCase();
    pool = pool.filter((p) => `${p.title}${p.subtitle}${p.tag}${p.desc}`.toLowerCase().includes(k));
  }
  const sorters = {
    recommend: (a, b) => (b.rating - a.rating) || (b.sales - a.sales),
    sales: (a, b) => b.sales - a.sales,
    new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    discount: (a, b) => discountOf(b) - discountOf(a)
  };
  pool.sort(sorters[sort] || sorters.recommend);
  const size = Math.max(1, Number(pageSize) || 12);
  const start = (Math.max(1, Number(page) || 1) - 1) * size;
  return {
    list: pool.slice(start, start + size).map(decorate),
    pagination: { page: Math.max(1, Number(page) || 1), pageSize: size, total: pool.length, totalPages: Math.max(1, Math.ceil(pool.length / size)) }
  };
}

function getProduct(id) {
  const raw = products.findById(id);
  if (!raw) return null;
  const item = decorate(raw);
  const catPool = products.all().filter((p) => p.category === item.category && p.id !== item.id);
  return { product: item, related: catPool.slice(0, 4).map(decorate) };
}

/** 秒杀：明天 10 点收档，取折扣最深且销量高的四件 */
function getSeckill(size = 4) {
  let end = new Date();
  end.setDate(end.getDate() + 1);
  end.setHours(10, 0, 0, 0);
  const now = Date.now();
  const list = products.all()
    .map(decorate)
    .filter((p) => discountOf(p) > 0)
    .sort((a, b) => (discountOf(b) - discountOf(a)) || (b.sales - a.sales))
    .slice(0, size)
    .map((p, i) => ({
      ...p,
      // 秒杀价在日常价上再让一档，前台倒计时到点自动恢复
      seckillPrice: Math.round(p.price * 0.9) - 1,
      soldOut: (p.stock - 40 + i * 7) <= 0,
      quota: 200 - i * 23
    }));
  return { endsAt: end.toISOString(), serverNow: new Date(now).toISOString(), list };
}

/** 首页编排：楼层数据一次拿全，避免前端多次往返 */
function getHome() {
  return {
    // 轮播图同样按文件是否存在决定用实拍图还是占位图
    banners: BANNERS.map((b, i) => {
      const link = localImage(`/img/mall/banner-${i + 1}.jpg`);
      return link ? { ...b, image: link } : b;
    }),
    categories: listCategories(),
    promises: PROMISES,
    seckill: getSeckill(4),
    featured: products.all().map(decorate).filter((p) => p.tag).slice(0, 6),
    top: listProducts({ sort: 'recommend', pageSize: 8 }).list,
    total: products.all().length
  };
}

/** 下单：扣库存、累加销量，返回可用域名含简化的"订单状态" */
function createOrder({ uid = 'anonymous', items = [], receiver = {}, remark = '' } = {}) {
  if (!Array.isArray(items) || !items.length) throw new Error('购物车为空，请先添加商品');
  const { name, phone, address } = receiver || {};
  if (!name || !phone || !address) throw new Error('请填写收货人、联系电话与收货地址');

  const lines = [];
  let total = 0;
  let saved = 0;
  for (const line of items) {
    const raw = products.findById(line.id);
    if (!raw) throw new Error(`商品 ${line.id} 已下架`);
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    if (raw.stock < qty) throw new Error(`「${raw.title}」库存不足，仅剩 ${raw.stock} 件`);
    const unit = decorate(raw);
    products.update(raw.id, { stock: raw.stock - qty, sales: (raw.sales || 0) + qty });
    lines.push({ id: unit.id, title: unit.title, cover: unit.cover, price: unit.price, qty, theme: unit.theme });
    total += unit.price * qty;
    saved += (unit.originalPrice || unit.price) * qty - unit.price * qty;
  }

  const freight = total >= 199 ? 0 : 12;
  const order = orders.insert({
    id: genId('HY'),
    uid,
    lines,
    amount: total,
    freight,
    payable: total + freight,
    saved: Math.round(saved),
    receiver: { name, phone, address },
    remark,
    status: '待付款',
    createdAt: nowISO()
  });
  orders.flush();
  products.flush();
  return order;
}

function listOrders(uid = '') {
  return orders.all()
    .filter((o) => !uid || o.uid === uid)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 20);
}

module.exports = { listCategories, listProducts, getProduct, getSeckill, getHome, createOrder, listOrders, PROMISES, CATEGORIES };
