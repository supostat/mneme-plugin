import { Matches } from 'class-validator';
import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Category } from './category.entity';
import { Tag } from './tag.entity';

@Entity('products')
@Index(['sku'], { unique: true })
export class Product {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Matches(/^[A-Z0-9-]{4,32}$/, { message: 'a SKU is 4 to 32 capitals, digits or dashes' })
  @Column({ length: 32 })
  sku: string;

  @Column('text')
  title: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: string;

  @ManyToOne(() => Category, (category) => category.products, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @ManyToMany(() => Tag, (tag) => tag.products)
  @JoinTable({ name: '_ProductToTag', joinColumn: { name: 'A' }, inverseJoinColumn: { name: 'B' } })
  tags: Tag[];
}
