import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from './Employee.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Location } from '../iam/Location.js';
import { User } from '../iam/User.js';

@Entity({ name: 'time_entries' })
export class TimeEntry {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location!: Location | null;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: Date;

  @Column({ name: 'clock_in_time', type: 'datetime' })
  clockInTime!: Date;

  @Column({ name: 'clock_out_time', type: 'datetime', nullable: true })
  clockOutTime!: Date | null;

  @Column({ name: 'total_hours', type: 'decimal', precision: 5, scale: 2, nullable: true })
  totalHours!: number | null;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes!: number;

  @Column({ name: 'overtime_hours', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  overtimeHours!: number;

  @Column({ name: 'entry_type', type: 'enum', enum: ['regular', 'overtime', 'holiday', 'sick', 'unpaid'], default: 'regular' })
  entryType!: 'regular' | 'overtime' | 'holiday' | 'sick' | 'unpaid';

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status!: 'pending' | 'approved' | 'rejected';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

