import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { Account } from './account.entity';
import { UuidEntity } from './uuid-entity';

@Entity('credentials')
export class Credential extends UuidEntity {
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @OneToOne(() => Account, (account) => account.credential, { nullable: false })
  @JoinColumn({ name: 'account_id', referencedColumnName: 'id' })
  account: Account;
}
