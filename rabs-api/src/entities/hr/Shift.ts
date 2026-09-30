import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from './Employee.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Location } from '../iam/Location.js';
import { User } from '../iam/User.js';

@Entity({ name: 'shifts' })
export class Shift {
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

  @Column({ name: 'shift_date', type: 'date' })
  shiftDate!: Date;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes!: number;

  @Column({ name: 'shift_type', type: 'enum', enum: ['regular', 'opening', 'closing', 'split', 'on_call'], default: 'regular' })
  shiftType!: 'regular' | 'opening' | 'closing' | 'split' | 'on_call';

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @Column({ type: 'enum', enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'], default: 'scheduled' })
  status!: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

