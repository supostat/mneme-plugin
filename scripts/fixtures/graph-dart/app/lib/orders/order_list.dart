import 'package:flutter/widgets.dart';
import 'package:shop_session/session.dart';

import 'order_archive.dart';
import 'order_row.dart';

abstract class OrderListView {}

final class OrderList implements OrderListView {
  OrderList(this.scope, this.rows);

  final SessionScope scope;
  final List<OrderRow> rows;
}
