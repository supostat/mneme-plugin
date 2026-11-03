import 'dart:convert';

import 'package:shop_contract/shop_contract.dart';

part 'order_row.g.dart';

class OrderRow {
  OrderRow(this.status);

  final ContractStatus status;
}

class _RowCache {}
