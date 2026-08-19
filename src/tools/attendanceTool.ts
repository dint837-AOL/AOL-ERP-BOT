import { Tool, dbRun } from '../openclaw-mock.js';

export const logAttendanceTool = new Tool({
  name: 'log_attendance',
  description: 'Log an employees daily check-in (IN) or check-out (OUT) time.',
  parameters: {
    type: 'object',
    properties: {
      action_type: {
        type: 'string',
        enum: ['IN', 'OUT'],
        description: 'Whether the employee is arriving (IN) or leaving (OUT)'
      },
      phone_number: {
        type: 'string',
        description: 'The WhatsApp phone number of the employee sending the message'
      }
    },
    required: ['action_type', 'phone_number']
  },
  execute: async (args: any) => {
    try {
      const nowIso = new Date().toISOString();
      await dbRun("INSERT INTO attendance (phone_number, action_type, timestamp) VALUES (?, ?, ?)", [args.phone_number, args.action_type, nowIso]);
      return `Successfully logged ${args.action_type} for ${args.phone_number} at server time.`;
    } catch (err: any) {
      throw new Error(`Failed to log attendance: ${err.message}`);
    }
  }
});
