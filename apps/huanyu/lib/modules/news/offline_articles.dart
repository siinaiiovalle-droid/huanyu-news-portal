import '../../core/models.dart';
/// 离线兜底稿件：本机新闻服务（3000 端口）不可达时新闻板块仍有内容。
List<Article> offlineArticles() {
  final now = DateTime.now();
  String ago(int m) => now.subtract(Duration(minutes: m)).toIso8601String();
  return <Article>[
    Article(
      id: 'off_c1',
      title: '多地上新促消费政策，假期文旅预订量同比增长明显',
      summary: '文旅、餐饮、家电以旧换新联动，假期消费市场热度走高。',
      channel: 'china',
      source: '寰宇新闻网',
      publishedAt: ago(26),
      views: 128400,
    ),
    Article(
      id: 'off_w1',
      title: '全球供应链重构加速，新兴市场制造业投资持续增长',
      summary: '多家机构上调新兴市场制造业增速预期，区域合作成为关键词。',
      channel: 'world',
      source: '寰宇新闻网',
      publishedAt: ago(95),
      views: 86210,
    ),
    Article(
      id: 'off_f1',
      title: 'A 股三大指数集体收涨，科技板块领涨成交额回升',
      summary: '两市成交额环比放大，资金回流科技成长主线。',
      channel: 'finance',
      source: '寰宇财经',
      publishedAt: ago(150),
      views: 204300,
    ),
    Article(
      id: 'off_t1',
      title: '国产大模型推理成本再降一半，中小企业接入门槛下降',
      summary: '算力调度与量化技术成熟，垂类应用迎来爆发期。',
      channel: 'tech',
      source: '寰宇科技',
      publishedAt: ago(210),
      views: 176500,
    ),
    Article(
      id: 'off_s1',
      title: '联赛收官战逆转取胜，主队时隔三年再度捧杯',
      summary: '下半场连入两球完成反超，全场观众人数创赛季新高。',
      channel: 'sports',
      source: '寰宇体育',
      publishedAt: ago(320),
      views: 318900,
    ),
    Article(
      id: 'off_h1',
      title: '换季呼吸道疾病高发，医生提醒做好三层防护',
      summary: '勤通风、戴口罩、及时接种疫苗仍是有效手段。',
      channel: 'health',
      source: '寰宇健康',
      publishedAt: ago(460),
      views: 97800,
    ),
  ];
}
