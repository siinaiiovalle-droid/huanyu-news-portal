import 'package:flutter_test/flutter_test.dart';
import 'package:huanyu/app.dart';

void main() {
  testWidgets('寰宇 App 冒烟测试', (WidgetTester tester) async {
    await tester.pumpWidget(const HuanyuApp());
    expect(find.byType(HuanyuApp), findsOneWidget);
  });
}
