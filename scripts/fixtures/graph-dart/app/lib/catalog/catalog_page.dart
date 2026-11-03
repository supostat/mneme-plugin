import "package:shop_session/session.dart";

import '../orders/order_row.dart';

sealed class CatalogPage {
  const CatalogPage(this.scope);

  final SessionScope scope;
}

typedef CatalogFilter = bool Function(OrderRow row);

typedef CatalogSort<T extends Comparable<T>> = int Function(T a, T b);
