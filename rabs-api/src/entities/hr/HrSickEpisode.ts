import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Employee } from './Employee.js';

@Entity({ name: 'hr_sick_episodes' })
export class HrSickEpisode {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ name: 'waiting_days', type: 'int', default: 3 })
  waitingDays!: number;

  @Column({ name: 'qualifying_days', type: 'int', default: 0 })
  qualifyingDays!: number;

  @Column({ name: 'ssp_days_paid', type: 'int', default: 0 })
  sspDaysPaid!: number;

  @Column({ name: 'ssp_rate', type: 'decimal', precision: 10, scale: 4, nullable: true })
  sspRate!: number | null;

  @Column({ name: 'ssp_total', type: 'decimal', precision: 15, scale: 4, default: 0 })
  sspTotal!: number;

  @Column({ name: 'linked_to_previous', type: 'tinyint', width: 1, default: 0 })
  linkedToPrevious!: boolean;

  @Column({ name: 'fit_note_received', type: 'tinyint', width: 1, default: 0 })
  fitNoteReceived!: boolean;

  @Column({ name: 'fit_note_s3_key', type: 'varchar', length: 500, nullable: true })
  fitNoteS3Key!: string | null;

  @Column({
    type: 'enum',
    enum: ['open', 'closed', 'cancelled'],
    default: 'open'
  })
  status!: 'open' | 'closed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
