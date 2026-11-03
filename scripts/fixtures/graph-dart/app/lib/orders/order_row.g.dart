part of 'order_row.dart';

extension OrderRowJson on OrderRow {
  String toJson() => jsonEncode({'status': status.name});
}
