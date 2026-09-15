/**
 * 广场（社交媒体信息流）种子内容
 *   authors —— 演示账号：官方号、编辑部账号与个人创作者
 *   posts   —— 动态模板：
 *     author      发布者 handle（对应 authors）
 *     channel     用于匹配关联配图的栏目（决定从 /img/news 里挑哪一类高清图）
 *     hoursAgo    发布距今天数（小时，支持小数）
 *     images      配图数量（0–4，从站内高清素材库挑选）
 *     quote       引用新闻稿件的标题关键词（命中即生成"动态 + 新闻卡片"复合帖）
 *     repostedBy  被哪些账号转发（复刻推特时间线的"某某转发了"）
 *     replies     回复 [[handle, 内容, 分钟前], ...]
 * 说明：配图统一使用站内已下载的高清图，保证广场与新闻正文的图片质量一致。
 */
module.exports = {
  authors: [
    { uid: 'u_flash', name: '寰宇快讯', handle: 'huanyu_flash', verified: true, bio: '寰宇新闻网官方账号 · 24 小时滚动播报' },
    { uid: 'u_tech', name: '科技观察室', handle: 'tech_lab', verified: true, bio: '人工智能、芯片与前沿科技观察' },
    { uid: 'u_life', name: '城市生活志', handle: 'city_life', verified: true, bio: '记录城市里的烟火气与人情味' },
    { uid: 'u_sports', name: '赛场内外', handle: 'sports_side', verified: true, bio: '赛事解读与运动员故事' },
    { uid: 'u_car', name: '车评人老周', handle: 'laozhou_car', verified: false, bio: '十年汽车媒体人，只说真话' },
    { uid: 'u_health', name: '健康自习室', handle: 'health_study', verified: true, bio: '靠谱的医学科普，不信偏方' },
    { uid: 'u_book', name: '读库笔记', handle: 'reading_notes', verified: false, bio: '读书、看展、逛博物馆' },
    { uid: 'u_may', name: '街拍阿May', handle: 'may_street', verified: false, bio: '用照片记录城市的光' },
    { uid: 'u_data', name: '数据小站', handle: 'data_station', verified: false, bio: '用图表说话，拒绝感觉派' }
  ],

  posts: [
    {
      author: 'huanyu_flash', channel: 'tech', hoursAgo: 0.3, images: 1, quote: '国产大模型推理成本再降一半',
      content: '【快讯】国产大模型推理成本再降一半，中小企业接入门槛明显下降。编辑部同事算了一笔账：同样的调用量，成本从每月六位数压到五位数。#人工智能#',
      replies: [['tech_lab', '成本降下来，真正的应用创新才有空间。'], ['data_station', '关键还是单位算力的有效吞吐，别只看单价。']],
      repostedBy: ['tech_lab']
    },
    {
      author: 'tech_lab', channel: 'tech', hoursAgo: 0.9, images: 2,
      content: '今天最大的感受：模型不再是门槛，工程化才是。把一个大模型稳定接进业务系统，光提示词版本管理这一件事就够折腾一个月。#人工智能# #工程化#',
      replies: [['huanyu_flash', '同感，落地比演示难十倍。']]
    },
    {
      author: 'tech_lab', channel: 'tech', hoursAgo: 3.2, images: 1, quote: '液冷服务器出货量翻倍',
      content: '液冷服务器出货量翻倍不是偶然——单机柜功率密度上去了，风冷真的压不住。数据中心能效比进 1.15 时代，散热的革命比芯片本身更值得关注。',
      replies: [['data_station', 'PUE 每降 0.1，一个中型数据中心一年省下的电费够养活一个团队。']]
    },
    {
      author: 'data_station', channel: 'tech', hoursAgo: 5.5, images: 0, quote: '开源社区年度报告',
      content: '开源社区报告有个细节容易被忽略：国内开发者贡献量增长 37%，但维护者数量并没有同步增长。写代码的人多了，管代码的人还是那批。',
      replies: [['tech_lab', '维护者倦怠是全世界开源社区的共同难题。']]
    },
    {
      author: 'may_street', channel: 'tech', hoursAgo: 8.4, images: 2, quote: '端侧 AI 手机出货占比突破四成',
      content: '端侧 AI 这两年最实用的两个功能，一个是离线翻译，一个是修图。飞机上没网也能用，这种「不依赖云端」的踏实感，比跑分重要多了。',
      replies: []
    },
    {
      author: 'tech_lab', channel: 'tech', hoursAgo: 13.6, images: 1, quote: '低空经济加速落地',
      content: '无人机配送航线覆盖千余社区。上周亲眼看到一单从下单到收货 11 分钟，配送员是台机器。城市物流的想象力一下被打开了。',
      repostedBy: ['huanyu_flash', 'city_life']
    },
    {
      author: 'city_life', channel: 'tech', hoursAgo: 22, images: 0,
      content: '一个有点扎心的观察：小区里的智能快递柜越来越多，会跟你打招呼的快递员越来越少了。技术在进步，人情味别掉队。#城市观察#',
      replies: [['may_street', '我们楼下那位师傅还会顺手帮老人搬米，机器做不到。'], ['health_study', '人际关系是健康的重要变量，这不是文艺说法，是有研究支持的。']]
    },
    {
      author: 'data_station', channel: 'finance', hoursAgo: 1.6, images: 0, quote: '消费市场暖意渐浓',
      content: '消费市场的数据里藏着结构变化：服务消费增速快于商品消费。人们不是买得更多了，而是更愿意为体验付费——看展、演出、旅行。#消费观察#',
      replies: [['city_life', '周末的展览和市集确实肉眼可见地变挤了。']]
    },
    {
      author: 'huanyu_flash', channel: 'finance', hoursAgo: 4.1, images: 1, quote: 'A 股三季报收官',
      content: '三季报收官，新能源与算力板块盈利增速领跑。提醒一句：盈利增速和股价走势从来不是一回事，别把财报当操作指令。',
      replies: [['data_station', '这条提醒值得置顶。']]
    },
    {
      author: 'data_station', channel: 'finance', hoursAgo: 9.8, images: 0, quote: '外贸数据超预期',
      content: '机电产品出口增长 12%，跨境电商拉动明显。传统外贸企业这几年最大的功课，是从「接单」变成「自己找客户」。#外贸#',
      replies: []
    },
    {
      author: 'huanyu_flash', channel: 'finance', hoursAgo: 16.5, images: 1, quote: '二手车市场透明度提升',
      content: '全国统一查询平台上线后，二手车最怕的「信息不对称」被削掉一大块。买二手车终于不用靠运气和人脉了。',
      replies: [['laozhou_car', '行业里规范的车商反而拍手叫好，劣币驱逐良币的时代该结束了。']],
      repostedBy: ['laozhou_car']
    },
    {
      author: 'laozhou_car', channel: 'auto', hoursAgo: 0.7, images: 2, quote: '充电 10 分钟续航 400 公里',
      content: '充电 10 分钟续航 400 公里进入量产阶段。但我还是要说句实话：真正决定体验的不是峰值功率，而是你到服务区的时候有没有空桩。#电动车#',
      replies: [['may_street', '去年国庆在服务区排队两小时，那才叫绝望。'], ['huanyu_flash', '补能网络的密度确实是关键变量。']],
      repostedBy: ['huanyu_flash']
    },
    {
      author: 'laozhou_car', channel: 'auto', hoursAgo: 6.3, images: 1, quote: '智能驾驶进入',
      content: '智能驾驶「去高精地图」这个转向挺务实的。高精地图覆盖成本高、更新慢，靠车端感知硬扛，虽然难，但路走得宽。',
      replies: [['tech_lab', '本质上是从「背题」转向「真理解」，端到端模型的价值就在这儿。']]
    },
    {
      author: 'may_street', channel: 'auto', hoursAgo: 27, images: 2, quote: '汽车出口再创新高',
      content: '在港口拍到一船车的滚装作业，密密麻麻全是等着出海的新车。站在岸上看，才真切感到「出口」这两个字的重量。#街头摄影#',
      replies: [['city_life', '这张构图绝了，光影也很讲究。']]
    },
    {
      author: 'huanyu_flash', channel: 'auto', hoursAgo: 41, images: 1, quote: '新能源车快充到底伤不伤电池',
      content: '一分钟读懂：新能源车快充到底伤不伤电池。结论不复杂——伤，但没你想的那么伤，真正的敌人是长期高温大电流叠加极端低温。',
      replies: [['laozhou_car', '补充一句：别在电量剩 5% 的时候才想起来充电。']]
    },
    {
      author: 'sports_side', channel: 'sports', hoursAgo: 1.1, images: 1, quote: '城市马拉松报名人数创新高',
      content: '城市马拉松报名人数创新高，「赛事经济」带动周末消费。一场赛事能给一座城市带来什么？酒店、餐饮、交通，甚至是一次重新被看见的机会。#马拉松#',
      replies: [['city_life', '赛道边的居民自发喊加油，那种氛围比成绩更打动我。'], ['may_street', '手机内存不够用是真的。']]
    },
    {
      author: 'sports_side', channel: 'sports', hoursAgo: 4.8, images: 2, quote: '职业联赛收官战吸引超过五万观众',
      content: '五万人同时在看台上唱队歌是什么体验？收官战现场那种声浪，隔着屏幕都能起鸡皮疙瘩。青训体系能不能跟上，决定了这份热闹能持续多久。',
      replies: [['huanyu_flash', '青训是最慢也最值的一笔投资。']],
      repostedBy: ['huanyu_flash']
    },
    {
      author: 'may_street', channel: 'sports', hoursAgo: 11.2, images: 2,
      content: '清晨六点的江边跑道，雾气还没散，已经有人在跑了。赛事会结束，但这种日复一日的坚持不会。#街头摄影# #跑步#',
      replies: [['health_study', '早晨适度运动对情绪的正向作用非常明显。'], ['sports_side', '这就是城市最动人的样子。']]
    },
    {
      author: 'health_study', channel: 'health', hoursAgo: 2.4, images: 0, quote: '睡眠门诊数据发布',
      content: '睡眠门诊数据：超半数就诊者存在入睡困难。给三条最朴素的建议——固定起床时间、睡前一小时离开手机、白天见够自然光。比任何助眠产品都管用。',
      replies: [['city_life', '第二条我做不到，其他两条还行。'], ['data_station', '固定起床时间这条最反直觉，但确实最有效。'], ['may_street', '自然光这条我作证，户外待一天晚上睡得特别沉。']],
      repostedBy: ['huanyu_flash', 'city_life', 'may_street']
    },
    {
      author: 'health_study', channel: 'health', hoursAgo: 7.9, images: 1, quote: '秋冬流感高发期来临',
      content: '秋冬流感高发。三类人群尽早接种疫苗，这句不是客套话。另外，抗生素对流感病毒无效，别再囤了。#流感#',
      replies: [['huanyu_flash', '抗生素治病毒，真的是最常见的误区之一。']]
    },
    {
      author: 'health_study', channel: 'health', hoursAgo: 20, images: 1, quote: '社区 15 分钟运动圈覆盖八成居民',
      content: '社区 15 分钟运动圈覆盖八成居民。别小看楼下那块健身区，它对「能不能坚持」的影响，比办一张两公里外的年卡大得多。',
      replies: [['city_life', '小区里加了条步道之后，晚上遛弯的人明显多了。']]
    },
    {
      author: 'city_life', channel: 'health', hoursAgo: 33, images: 0, quote: '秋冬饮食指南',
      content: '进补不等于大补。秋天最容易犯的错，是把「贴秋膘」当成吃顿好的的理由。均衡、适量、规律，才是过冬最稳的方案。#饮食#',
      replies: [['health_study', '总结得比我原文还精炼。']]
    },
    {
      author: 'reading_notes', channel: 'culture', hoursAgo: 1.9, images: 1, quote: '古籍数字化成果开放',
      content: '百万页古籍文献可在线检索，这件事的意义要过二十年才看得清。今天我们随手能查的东西，是过去学者跑遍全国图书馆才能看到的一页。',
      replies: [['tech_lab', '数字化 + 模型，古籍整理可能要迎来一次真正的加速。'], ['huanyu_flash', '值得单独做一期深度。']],
      repostedBy: ['huanyu_flash']
    },
    {
      author: 'reading_notes', channel: 'culture', hoursAgo: 5.1, images: 2, quote: '博物馆热持续升温',
      content: '博物馆年轻观众占比超过六成。以前是「被家长带来」，现在是「自己排队来」。看展正在变成一种很日常的周末选项。#博物馆#',
      replies: [['may_street', '现在抢票比演唱会还难。'], ['city_life', '文创店排队的人比展厅还多。']]
    },
    {
      author: 'reading_notes', channel: 'culture', hoursAgo: 12.4, images: 1, quote: '非遗工坊走进城市商圈',
      content: '非遗工坊开进商圈，油纸伞、扎染、木刻都能自己上手做。手作体验成为周末新选择，挺好——传统手艺需要的从来不是被保护，而是被使用。',
      replies: [['reading_notes', '后半句说得很准。']]
    },
    {
      author: 'city_life', channel: 'culture', hoursAgo: 25, images: 2, quote: '城市阅读空间扩容',
      content: '24 小时书房点亮深夜街角。凌晨两点进去，还有人在看书、有人在写东西。一座城市愿意为一盏不熄的灯付费，这件事本身就很温柔。#城市观察#',
      replies: [['reading_notes', '深夜的书店是城市的另一种安全感。'], ['health_study', '不过熬夜看书这件事我们还是要劝一句。']],
      repostedBy: ['reading_notes', 'huanyu_flash']
    },
    {
      author: 'may_street', channel: 'video', hoursAgo: 0.5, images: 2,
      content: '分享一个小技巧：拍夜景不要一味追求「亮」，把高光压住、留出暗部，照片反而更有质感。手机也一样适用。#摄影技巧#',
      replies: [['reading_notes', '学到了，下次试试。'], ['huanyu_flash', '编辑部同事已转发到群里。']],
      repostedBy: ['huanyu_flash']
    },
    {
      author: 'may_street', channel: 'video', hoursAgo: 15.3, images: 1, quote: '数据中心的一天',
      content: '第一次进数据中心参观，最冲击的不是机器多，而是安静——安静得能听见自己的脚步。那种「庞大的东西安静地运转」的感觉很难描述。#纪录片#',
      replies: [['tech_lab', '机房里的噪音其实是运维的心病，静音是技术进步的体现。']]
    },
    {
      author: 'huanyu_flash', channel: 'video', hoursAgo: 6.8, images: 1, quote: '国产大型邮轮内部全览',
      content: '国产大型邮轮完成第二次商业航次，旅客满意度超九成。海上度假生活长这样，现场视频看着确实有点心动。',
      replies: [['city_life', '想去的举手。'], ['may_street', '已经收藏了。']]
    },
    {
      author: 'city_life', channel: 'china', hoursAgo: 2.1, images: 1, quote: '全国高铁网再扩容',
      content: '三条新线同日开通，城市群通勤半径大幅缩短。有朋友算了算，上班单程少四十分钟——这四十分钟，一年就是三百多个小时，是能陪家人吃早饭的时间。',
      replies: [['data_station', '通勤时间是幸福感里最被低估的变量。'], ['huanyu_flash', '这个角度值得做一期报道。']],
      repostedBy: ['huanyu_flash', 'data_station']
    },
    {
      author: 'city_life', channel: 'china', hoursAgo: 9.2, images: 2, quote: '城市夜间经济回暖',
      content: '24 小时书店、深夜食堂带动的客流增长了三成。夜晚的城市不该只有便利店和外卖，还有热汤和聊天声。#城市观察#',
      replies: [['may_street', '夜里的街拍素材这段时间丰富了不少。']]
    },
    {
      author: 'data_station', channel: 'china', hoursAgo: 18.7, images: 1, quote: '县域电商新样本',
      content: '农产品从田间到餐桌只用 18 小时。这个数字背后是冷链、分拣、干线运输的整套配合。电商下乡真正的门槛，从来不是网速。',
      replies: [['city_life', '去年买过一箱产地直发的桃子，早上摘晚上到，确实不一样。']]
    },
    {
      author: 'city_life', channel: 'china', hoursAgo: 30, images: 1, quote: '城市体检报告发布',
      content: '三成老旧小区完成适老化改造。评价一个社区好不好，不妨看看推着轮椅能不能顺利走完一圈,扶手够不够、坡道缓不缓。#城市观察#',
      replies: [['health_study', '这直接决定了很多老人能不能出门，是健康问题不只是工程问题。']]
    },
    {
      author: 'huanyu_flash', channel: 'china', hoursAgo: 44, images: 1, quote: '寒潮预警升级',
      content: '寒潮预警升级，北方多地气温骤降 12℃。提醒两件小事：水管防冻、老人小孩减少早晚外出。能源保供已进入临战状态。',
      replies: [['health_study', '气温骤降是心脑血管事件的高发窗口，务必注意。']],
      repostedBy: ['health_study']
    },
    {
      author: 'huanyu_flash', channel: 'world', hoursAgo: 3.6, images: 1, quote: '深空探测再传捷报',
      content: '深空探测再传捷报：探测器完成小行星伴飞与采样返回模拟。宇宙级的浪漫，背后是几十年不出错的工程。#航天#',
      replies: [['tech_lab', '航天工程的容错率要求，是其他行业难以想象的。'], ['data_station', '想看看这次带回的数据有多少。']],
      repostedBy: ['tech_lab', 'data_station']
    },
    {
      author: 'data_station', channel: 'world', hoursAgo: 10.5, images: 0, quote: '国际航班持续恢复',
      content: '多条洲际航线复航，机票价格回落两成。对做跨境生意的人来说，能直飞意味着一天能多谈一个客户。',
      replies: [['huanyu_flash', '商务出行的效率账确实不一样。']]
    },
    {
      author: 'reading_notes', channel: 'world', hoursAgo: 21.8, images: 2, quote: '海外中餐加速',
      content: '海外中餐「本地化」的讨论很有意思：小份菜、植物基菜品走俏，是妥协还是进化？食物的传播史本来就是一部不断改写配方的历史。#美食#',
      replies: [['city_life', '好吃才是硬道理，其他都是附加值。']]
    },
    {
      author: 'data_station', channel: 'world', hoursAgo: 36, images: 1, quote: '全球粮价连续三个月回落',
      content: '全球粮价连续三个月回落，主产区丰收缓解了供给压力。价格曲线背后是天气、物流和预期三件事在互相作用。',
      replies: []
    },
    {
      author: 'reading_notes', channel: 'ent', hoursAgo: 4.4, images: 1, quote: '剧集市场回归内容本位',
      content: '现实题材占比提升到六成。观众用遥控器投票的结果很诚实：流量能带来开局，故事才决定结局。#剧集#',
      replies: [['may_street', '最近确实有几部片子是会想二刷的。']],
      repostedBy: ['huanyu_flash']
    },
    {
      author: 'reading_notes', channel: 'ent', hoursAgo: 14.9, images: 2, quote: '国产动画电影票房破纪录',
      content: '国产动画电影票房破纪录，工业化制作体系逐渐成型。所谓工业化，就是让「出一部好作品」从运气变成流程。#动画#',
      replies: [['tech_lab', '流程化才能规模化，这点和软件行业一模一样。']]
    },
    {
      author: 'city_life', channel: 'ent', hoursAgo: 23.5, images: 1, quote: '音乐节与文旅深度融合',
      content: '跨城看演出带火了一座座小城。朋友上个月为了音乐节跑了趟外地，顺便玩了三天——现在的年轻人，演出是理由，出行是目的。#音乐节#',
      replies: [['may_street', '我就是那个为了演出出城的人。'], ['sports_side', '和马拉松「赛事经济」是同一个逻辑。']]
    },
    {
      author: 'huanyu_flash', channel: 'ent', hoursAgo: 47, images: 1, quote: '国风综艺出海',
      content: '国风综艺多语种版本上线，文化细节被逐帧考据。有外国观众在评论区讨论一件衣服上的纹样是什么寓意——这大概就是最好的文化输出方式。',
      replies: [['reading_notes', '被认真对待的细节，才有人愿意认真看。']]
    },
    {
      author: 'data_station', channel: 'sports', hoursAgo: 29, images: 2, quote: '游泳世界杯落幕',
      content: '多项赛会纪录被刷新，青年选手崛起。看成绩单的时候特别注意了一下年龄——很多纪录创造者还没到二十岁。',
      replies: [['sports_side', '青训的成果就是这样，安静地攒几年然后集体爆发。']]
    },
    {
      author: 'may_street', channel: 'china', hoursAgo: 52, images: 2,
      content: '整理硬盘翻到一张去年的照片：清晨的城市在雾里慢慢醒过来。拍照这件事最好的地方，是它逼着你早起、出门、抬头。#街头摄影#',
      replies: [['city_life', '这句话值得抄在本子上。']]
    },
    {
      author: 'huanyu_flash', channel: 'world', hoursAgo: 58, images: 1,
      content: '本周开放数据盘点：外贸、消费、粮价、航班四组数据均已上线，可在门户「开放 API」页直接调用，App 端已同步。',
      replies: [['data_station', '接口文档写得很清楚，赞一个。']]
    },
    {
      author: 'tech_lab', channel: 'tech', hoursAgo: 63, images: 1,
      content: '一个反常识的结论：大多数 AI 项目失败不是因为模型不行，而是因为没人用。上线第一天就要想清楚「谁会打开它」。#人工智能#',
      replies: [['city_life', '这句话适用于所有产品。'], ['huanyu_flash', '值得做一期编辑部内部复盘。']],
      repostedBy: ['huanyu_flash', 'data_station', 'reading_notes']
    },
    {
      author: 'health_study', channel: 'health', hoursAgo: 71, images: 1,
      content: '本周健康小结：三件性价比最高的事——每天走够六千步、睡够七小时、每周和人好好吃一顿饭。第三条常被忽略，但它同样重要。',
      replies: [['city_life', '第三条我要打五星。'], ['reading_notes', '深有体会。']],
      repostedBy: ['city_life', 'huanyu_flash']
    },
    {
      author: 'city_life', channel: 'world', hoursAgo: 86, images: 1,
      content: '城市观察系列第 12 期：坐一趟末班公交，从起点到终点，看看一座城市在深夜还醒着哪些角落。素材已整理，明天发长文。#城市观察#',
      replies: [['may_street', '末班车上的人都有一张故事感很强的脸。']]
    }
  ]
};
