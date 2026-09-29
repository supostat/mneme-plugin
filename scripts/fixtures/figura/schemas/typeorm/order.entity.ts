import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Account } from './account.entity';
import { OrderItem } from './order-item.entity';
import { UuidEntity } from './uuid-entity';

@Entity({ name: 'orders' })
@Index(['account', 'number'], { unique: true })
export class Order extends UuidEntity {
  @Column()
  number: number;

  @Column({ name: 'placed_at', type: 'timestamptz' })
  placedAt: Date;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => Account, (account) => account.orders, { nullable: false })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];

  totalQuantity = (): number => this.items.reduce((sum, item) => sum + item.quantity, 0);
}
