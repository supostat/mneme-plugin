import { Column, Entity, Index, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'tags' })
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 64 })
  label: string;

  @ManyToMany(() => Product, (product) => product.tags)
  products: Product[];
}
