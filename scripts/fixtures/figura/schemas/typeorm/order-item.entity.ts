import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm'
import { Order } from './order.entity'
import { Product } from './product.entity'

@Entity()
export class OrderItem {
  @PrimaryColumn({ name: 'order_id', type: 'uuid' })
  orderId: string

  @PrimaryColumn({ name: 'product_id', type: 'bigint' })
  productId: string

  @Column()
  quantity: number

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn({ name: 'order_id' })
  order: Order

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product
}
