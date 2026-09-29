import { Entity, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn, TreeParent, VersionColumn } from 'typeorm';
import { AuditTrail } from './audit-trail';

@Entity()
export class Holder {
  @PrimaryGeneratedColumn()
  id: number;
}

@Entity()
export class Ledger extends AuditTrail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @VersionColumn()
  version: number;

  @TreeParent()
  parent: Ledger;

  @ManyToOne(() => Holder)
  owner: Holder;

  @ManyToMany(() => Holder)
  @JoinTable()
  auditors: Holder[];
}
