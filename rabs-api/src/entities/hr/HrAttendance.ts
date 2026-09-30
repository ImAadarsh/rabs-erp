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
import { User } from '../iam/User.js';

@Entity({ name: 'hr_attendance' })
export class HrAttendance {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({
    type: 'enum',
    enum: ['present', 'absent', 'late', 'half_day', 'holiday', 'sick', 'remote'],
    default: 'present'
  })
  status!: 'present' | 'absent' | 'late' | 'half_day' | 'holiday' | 'sick' | 'remote';

  @Column({ name: 'clock_in', type: 'time', nullable: true })
  clockIn!: string | null;

  @Column({ name: 'clock_out', type: 'time', nullable: true })
  clockOut!: string | null;

  @Column({ name: 'hours_worked', type: 'decimal', precision: 5, scale: 2, nullable: true })
  hoursWorked!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @Column({ name: 'recorded_by', type: 'bigint', unsigned: true, nullable: true })
  recordedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recorded_by' })
  recordedBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
