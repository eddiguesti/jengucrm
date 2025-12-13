import Imap from 'imap';

const config = process.env.SMTP_INBOX_1?.split('|');
if (!config) {
  console.log('No SMTP_INBOX_1');
  process.exit(1);
}

const [email, password, host] = config;
console.log('Checking:', email);

const imap = new Imap({
  user: email,
  password: password,
  host: host,
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

imap.once('ready', () => {
  imap.openBox('INBOX', true, (err, box) => {
    if (err) { console.error(err); imap.end(); return; }
    console.log('Total messages:', box.messages.total);
    console.log('Unseen:', box.messages.unseen);

    // Get last 10 emails
    if (box.messages.total > 0) {
      const start = Math.max(1, box.messages.total - 9);
      const fetch = imap.seq.fetch(`${start}:*`, {
        bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)',
        struct: true
      });

      fetch.on('message', (msg, seqno) => {
        msg.on('body', (stream) => {
          let buffer = '';
          stream.on('data', (chunk: Buffer) => buffer += chunk.toString('utf8'));
          stream.on('end', () => console.log('---\n' + buffer.trim()));
        });
      });

      fetch.once('end', () => imap.end());
    } else {
      imap.end();
    }
  });
});

imap.once('error', (err: Error) => console.error('IMAP error:', err.message));
imap.connect();
