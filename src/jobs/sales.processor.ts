import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';

@Processor('sales-report')
@Injectable()
export class SalesProcessor extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    console.log(`[BullMQ] Starting job "${job.name}" (ID: ${job.id})`);
    
    if (job.name === 'generate-receipt') {
      const { saleId } = job.data;
      console.log(`[BullMQ] Generating invoice PDF and syncing ledger for sale ID: ${saleId}...`);
      
      // Simulate background PDF creation / accounting sync
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      console.log(`[BullMQ] Completed report sync for ${saleId}.`);
      return { success: true, processedAt: new Date().toISOString() };
    }
  }
}
