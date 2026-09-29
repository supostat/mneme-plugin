import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ length: 64 })
  name: string;

  @ManyToOne(() => Category, (category) => category.children, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
