import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AccFixedAsset } from './AccFixedAsset.js';
import { JournalEntry } from './JournalEntry.js';

@Entity({ name: 'acc_depreciation_schedule' })
export class AccDepreciationSchedule {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'asset_id', type: 'bigint', unsigned: true })
  assetId!: string;

  @ManyToOne(() => AccFixedAsset, (a) => a.schedule)
  @JoinColumn({ name: 'asset_id' })
  asset!: AccFixedAsset;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount!: number;

  @Column({ name: 'journal_entry_id', type: 'bigint', unsigned: true, nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({
    type: 'enum',
    enum: ['scheduled', 'posted', 'skipped'],
    default: 'scheduled'
  })
  status!: 'scheduled' | 'posted' | 'skipped';

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
