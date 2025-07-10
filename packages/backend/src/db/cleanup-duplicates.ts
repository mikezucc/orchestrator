import { db } from './index.js';
import { virtualMachines } from './schema';
import { sql } from 'drizzle-orm';

async function cleanupDuplicateVMs() {
  console.log('Starting cleanup of duplicate VMs...');
  
  try {
    // Find duplicates
    const duplicates = await db.execute(sql`
      SELECT gcp_instance_id, user_id, COUNT(*) as count
      FROM virtual_machines
      WHERE gcp_instance_id IS NOT NULL
      GROUP BY gcp_instance_id, user_id
      HAVING COUNT(*) > 1
    `);

    console.log(`Found ${duplicates.rows.length} sets of duplicates`);

    for (const dup of duplicates.rows) {
      const gcpInstanceId = dup.gcp_instance_id as string;
      const userId = dup.user_id as string;
      const count = dup.count as number;
      
      console.log(`Processing ${count} duplicates for GCP instance ${gcpInstanceId} and user ${userId}`);
      
      // Get all VMs with this gcpInstanceId and userId
      const vms = await db.execute(sql`
        SELECT id, name, updated_at
        FROM virtual_machines
        WHERE gcp_instance_id = ${gcpInstanceId}
          AND user_id = ${userId}
        ORDER BY updated_at DESC
      `);
      
      // Keep the most recently updated one, delete the rest
      const toKeep = vms.rows[0];
      const toDelete = vms.rows.slice(1);
      
      console.log(`  Keeping VM: ${toKeep.name} (updated: ${toKeep.updated_at})`);
      
      for (const vm of toDelete) {
        console.log(`  Deleting VM: ${vm.name} (updated: ${vm.updated_at})`);
        
        // Delete related records first
        await db.execute(sql`DELETE FROM firewall_rules WHERE vm_id = ${vm.id}`);
        await db.execute(sql`DELETE FROM port_labels WHERE vm_id = ${vm.id}`);
        await db.execute(sql`DELETE FROM virtual_machines WHERE id = ${vm.id}`);
      }
    }

    console.log('Cleanup completed successfully!');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupDuplicateVMs().then(() => {
  console.log('Done!');
  process.exit(0);
});