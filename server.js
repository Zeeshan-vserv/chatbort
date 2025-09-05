// server.js (Updated)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(cors());

// ---------------- Chat Logging ----------------
const chatLogDir = path.join(__dirname, 'logs');
if (!fs.existsSync(chatLogDir)) fs.mkdirSync(chatLogDir, { recursive: true });
const chatLogFile = path.join(chatLogDir, 'chat-history.jsonl');

async function appendChatRecord(record) {
  const line = JSON.stringify(record) + '\n';
  await fs.promises.appendFile(chatLogFile, line, { encoding: 'utf8' });
}

app.post('/api/log-chat', async (req, res) => {
  try {
    const { role, message } = req.body || {};
    if (!role || !message) {
      return res.status(400).json({ ok: false, error: 'role and message are required' });
    }

    const record = { role, message };
    await appendChatRecord(record);

    res.json({ ok: true });
  } catch (err) {
    console.error('chat log append failed:', err);
    res.status(500).json({ ok: false, error: 'log_failed' });
  }
});

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_PORT === '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Excel path
const ticketFilePath = path.join('./support_tickets.xlsx');

// Generate IST Date
function getISTDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * 5.5); // +5:30
}

// Generate unique ticket ID with date + sequence
function generateTicketID() {
  let workbook, worksheet;
  let lastSeq = 0;

  if (fs.existsSync(ticketFilePath)) {
    workbook = xlsx.readFile(ticketFilePath);
    worksheet = workbook.Sheets['Tickets'];
    const existingData = xlsx.utils.sheet_to_json(worksheet);

    // filter today's tickets
    const today = getISTDate();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    const todaysTickets = existingData.filter((t) => t["Ticket ID"]?.startsWith(`VB${dateStr}`));

    if (todaysTickets.length > 0) {
      const lastTicket = todaysTickets[todaysTickets.length - 1];
      const lastId = lastTicket["Ticket ID"];
      lastSeq = parseInt(lastId.replace(`VB${dateStr}`, ""), 10) || 0;
    }
  }

  const now = getISTDate();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}`;
  const newSeq = lastSeq + 1;
  return `VB${dateStr}${newSeq}`;
}

// Log ticket to Excel
function logToExcel(ticketDetails) {
  let workbook, worksheet;

  if (fs.existsSync(ticketFilePath)) {
    workbook = xlsx.readFile(ticketFilePath);
    worksheet = workbook.Sheets['Tickets'];
  } else {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.json_to_sheet([]);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Tickets');
  }

  const existingData = xlsx.utils.sheet_to_json(worksheet);
  existingData.push({
    "Ticket ID": ticketDetails.ticketID,
    "Name": ticketDetails.name,
    "Mobile": ticketDetails.mobile,
    "Email": ticketDetails.email,
    "Reason": ticketDetails.reason,
    "Timestamp": ticketDetails.timestamp
  });

  const updatedSheet = xlsx.utils.json_to_sheet(existingData, {
    header: ['Ticket ID', 'Name', 'Mobile', 'Email', 'Reason', 'Timestamp']
  });
  workbook.Sheets['Tickets'] = updatedSheet;
  xlsx.writeFile(workbook, ticketFilePath);
}

// Send support team email
async function sendSupportEmail(ticket) {
  const mailOptions = {
    from: `"Vserv Lumo Bot Support" <${process.env.EMAIL_USER}>`,
    to: 'krishna.mohan@vservit.com', // Support team email
    subject: `New Support Request - Ticket ID: ${ticket.ticketID}`,
    html: `
      <p>A new support request has been raised via the Vserv Lumo Bot chatbot:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticketID}</li>
        <li><strong>Name:</strong> ${ticket.name}</li>
        <li><strong>Mobile:</strong> ${ticket.mobile}</li>
        <li><strong>Email:</strong> ${ticket.email}</li>
        <li><strong>Reason:</strong> ${ticket.reason || 'Not Provided'}</li>
        <li><strong>Time:</strong> ${ticket.timestamp}</li>
      </ul>
      <p>Please contact the user as soon as possible.</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Support team email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Support email send failed:', error);
    return false;
  }
}

// Send confirmation mail to user
async function sendUserConfirmationEmail(ticket) {
  const mailOptions = {
    from: `"Vserv Lumo Bot Support" <${process.env.EMAIL_USER}>`,
    to: ticket.email,
    subject: `Your Support Request (Ticket ID: ${ticket.ticketID})`,
    html: `
      <p>Dear ${ticket.name},</p>
      <p>We have received your support request. Our team will get back to you shortly.</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticketID}</li>
        <li><strong>Reason:</strong> ${ticket.reason || 'Not Provided'}</li>
        <li><strong>Time:</strong> ${ticket.timestamp}</li>
      </ul>
      <p>Thank you for reaching out to us</p>
      <p>Thanks & Regards,</p>
          <p>Vserv Infosystems Private Limited</p>
          <p>Address: H.O.: 268
          , Tower A, 6th Floor, The Corenthum Building, Sector-62, Noida, Uttar Pradesh, 201309, INDIA</p>
          <br/>
      <div style="margin-bottom:16px;">
        <img src="cid:vservlogo" alt="VSERV Logo" style="height:40px;" />
      </div>
    `,
    attachments: [
      {
        filename: 'mailPic.jpg',
        path: path.join(__dirname, './mailPic.png'),
        cid: 'vservlogo'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('User confirmation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('User confirmation email send failed:', error);
    return false;
  }
}

// API endpoint
app.post('/api/send-support-email', async (req, res) => {
  const { name, mobile, email, reason } = req.body;

  if (!name || !mobile || !email) {
    return res.status(400).json({ success: false, message: 'Missing required support details.' });
  }

  const ticketID = generateTicketID();
  const timestamp = getISTDate().toLocaleString();
  const ticketData = { ticketID, name, mobile, email, reason, timestamp };

  logToExcel(ticketData);

  const supportEmailSent = await sendSupportEmail(ticketData);
  const userEmailSent = await sendUserConfirmationEmail(ticketData);

  if (supportEmailSent && userEmailSent) {
    res.status(200).json({ success: true, message: 'Support request submitted successfully.', ticketID });
  } else if (supportEmailSent) {
    res.status(200).json({ success: true, message: 'Support request submitted. User email failed.', ticketID });
  } else {
    res.status(500).json({ success: false, message: 'Failed to send support request email.', ticketID });
  }
});  // make sure path is correct

// Start server
app.listen(port, () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});
