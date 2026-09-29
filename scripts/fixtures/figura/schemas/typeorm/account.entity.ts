import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, OneToMany, OneToOne, UpdateDateColumn } from 'typeorm';
import { Credential } from './credential.entity';
import { Order } from './order.entity';
import { UuidEntity } from './uuid-entity';

export enum Role {
  Admin = 'ADMIN',
  Member = 'MEMBER',
}

@Entity('accounts')
export class Account extends UuidEntity {
  @ApiProperty({ example: 'ada@example.com' })
  @Column({ type: 'varchar', length: 320, unique: true })
  email: string;

  /* @Column() legacyCode: string; */
  @Index({ unique: true, where: '"deleted_at" IS NULL' })
  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName: string | null;

  @Column({ type: 'enum', enum: Role, enumName: 'account_role', default: Role.Member })
  role: Role;

  @CreateDateColumn({ name: 'created_at', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', precision: 3 })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', precision: 3 })
  deletedAt: Date | null;

  @OneToOne(() => Credential, (credential) => credential.account)
  credential: Credential;

  @OneToMany(() => Order, (order) => order.account)
  orders: Order[];

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
