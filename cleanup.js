const cron = require('node-cron');
const { Pool } = require('pg');

// Set up PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'your_database_url',
});

// Function to delete sessions older than 24 hours
async function deleteOldSessions() {
    try {
        const client = await pool.connect();
        const query = `
            DELETE FROM sessions WHERE created_at < NOW() - INTERVAL '24 HOURS';
        `;
        await client.query(query);
        console.log('Old sessions deleted successfully.');
        client.release();
    } catch (err) {
        console.error('Error during session cleanup:', err);
    }
}

// Schedule the task to run every day at midnight (00:00)
cron.schedule('0 0 * * *', deleteOldSessions);  // This runs every day at midnight (UTC)
