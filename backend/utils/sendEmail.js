// Mock email utility. In a real deployment this would call a provider
// like SendGrid, Resend, or Nodemailer + SMTP. For AVIP 2026 the task
// only requires the *flow* to exist, so this logs the "email" to the
// console/server logs instead of actually sending anything.
const sendEmail = async ({ to, subject, text }) => {
  console.log('--- MOCK EMAIL ---');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${text}`);
  console.log('------------------');
  return Promise.resolve({ mocked: true });
};

module.exports = sendEmail;
