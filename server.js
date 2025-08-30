// server.js (New file)
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import 'dotenv/config'; // Crucial: Loads .env variables here on the Node.js backend
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const app = express();
const port = process.env.PORT || 3001; // Choose a port for your backend API

// Middleware
app.use(bodyParser.json()); // Parses JSON bodies from incoming requests
app.use(cors());            // Allows your frontend to make requests to this backend

// Nodemailer Transporter (moved from chatbot.js)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_PORT === '465', // True for port 465 (SSL/TLS), false for others like 587 (STARTTLS)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate unique 5-digit ticket ID
function generateTicketID() {
  const number = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number (1000–9999)
  return `VS${number}`;
}


// Excel logging path
const ticketFilePath = path.join('./support_tickets.xlsx');

// Log to Excel
function logToExcel(ticketDetails) {
  let workbook;
  let worksheet;

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

// Function to send support email (moved from chatbot.js)
async function sendSupportEmail(ticket) {
  const mailOptions = {
    from: `"VBuddy Support" <${process.env.EMAIL_USER}>`,
    to: 'krishna.mohan@vservit.com', // <<--- IMPORTANT: REPLACE with your ACTUAL helpdesk email
    subject: `New Support Request - Ticket ID: ${ticket.ticketID}`,
    html: `
      <p>A new support request has been raised via the VBuddy chatbot with the following details:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticketID}</li>
        <li><strong>Name:</strong> ${ticket.name}</li>
        <li><strong>Mobile:</strong> ${ticket.mobile}</li>
        <li><strong>Email:</strong> ${ticket.email}</li>
        <li><strong>Reason:</strong> ${ticket.reason || 'Not Provided'}</li>
        <li><strong>Time:</strong> ${ticket.timestamp}</li>
      </ul>
      <p>Please contact the user as soon as possible.</p>
      <p>Thank you,<br/>VBuddy Chatbot</p>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}  

// API endpoint for support requests
app.post('/api/send-support-email', async (req, res) => {
  const { name, mobile, email, reason } = req.body; // Extract data from the request body

  if (!name || !mobile || !email) {
    return res.status(400).json({ success: false, message: 'Missing required support details.' });
  }

  const ticketID = generateTicketID();
  const timestamp = new Date().toLocaleString();
  const ticketData = { ticketID, name, mobile, email, reason, timestamp };

  logToExcel(ticketData);
  const emailSent = await sendSupportEmail(ticketData);

  if (emailSent) {
    res.status(200).json({ success: true, message: 'Support request successfully submitted.', ticketID, });
  } else {
    res.status(500).json({ success: false, message: 'Failed to send support request email.', ticketID, });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});