import { PrimaryGeneratedColumn } from 'typeorm';

export abstract class UuidEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
