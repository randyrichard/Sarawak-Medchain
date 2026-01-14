import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { isVerifiedDoctor, writeRecord, readRecords, getMyBalance } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';

export default function DoctorPortal({ walletAddress }) {
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);

  // Upload form state
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // MC Success state for QR code
  const [mcSuccess, setMcSuccess] = useState(null);
  const qrRef = useRef(null);

  // Read records state
  const [readPatientAddress, setReadPatientAddress] = useState('');
  const [patientRecords, setPatientRecords] = useState([]);

  useEffect(() => {
    checkDoctorStatus();
    checkBackendStatus();
    fetchCreditBalance();
  }, [walletAddress]);

  const fetchCreditBalance = async () => {
    try {
      const balance = await getMyBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error('Error fetching credit balance:', error);
    }
  };

  const checkDoctorStatus = async () => {
    try {
      const verified = await isVerifiedDoctor(walletAddress);
      setIsVerified(verified);
      if (!verified) {
        setMessage('⚠️ You are not a verified doctor. Contact admin to get verified.');
      } else {
        setMessage('✓ You are verified as a doctor');
      }
    } catch (error) {
      console.error('Error checking doctor status:', error);
      setMessage(`Error: ${error.message}`);
    }
  };

  const checkBackendStatus = async () => {
    try {
      const status = await checkStatus();
      setBackendStatus(status);
      if (status.ipfs !== 'connected') {
        setMessage('⚠️ IPFS not connected. Please start IPFS daemon.');
      }
    } catch (error) {
      console.error('Backend status error:', error);
      setMessage('⚠️ Backend server not reachable');
    }
  };

  // Download QR code as image
  const downloadQRCode = () => {
    if (!qrRef.current || !mcSuccess) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const link = document.createElement('a');
      link.download = `MC-${mcSuccess.ipfsHash.slice(0, 8)}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  // Close MC success modal
  const closeMcSuccess = () => {
    setMcSuccess(null);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setMessage(`Selected: ${file.name}`);
    } else {
      setMessage('Error: Only PDF files are allowed');
      setSelectedFile(null);
    }
  };

  const handleUploadRecord = async (e) => {
    e.preventDefault();

    if (!isVerified) {
      setMessage('Error: You must be a verified doctor');
      return;
    }

    if (!selectedFile || !patientAddress) {
      setMessage('Error: Please select a file and enter patient address');
      return;
    }

    try {
      setLoading(true);
      setMessage('Step 1/3: Uploading and encrypting file...');

      // Upload to backend (encrypts and uploads to IPFS)
      const { ipfsHash, encryptionKey } = await uploadMedicalRecord(
        selectedFile,
        patientAddress
      );

      setMessage(`Step 2/3: Writing to blockchain...`);

      // Write record reference to blockchain
      await writeRecord(patientAddress, ipfsHash);

      setMessage(`✓ Record uploaded successfully!`);

      // Set MC success data for QR code display
      setMcSuccess({
        ipfsHash,
        encryptionKey,
        patientAddress,
        timestamp: new Date().toISOString()
      });

      // Refresh credit balance after upload
      await fetchCreditBalance();

      // Reset form
      setSelectedFile(null);
      setPatientAddress('');
      e.target.reset();

    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReadRecords = async () => {
    if (!readPatientAddress) {
      setMessage('Error: Please enter patient address');
      return;
    }

    try {
      setLoading(true);
      setMessage('Reading patient records...');

      const receipt = await readRecords(readPatientAddress);

      setMessage('✓ Access granted! Check transaction receipt for records.');
      console.log('Transaction receipt:', receipt);

    } catch (error) {
      console.error('Read error:', error);
      if (error.message.includes('Access denied')) {
        setMessage('Error: Access denied. Patient has not granted you permission.');
      } else {
        setMessage(`Error: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="portal-container">
      <h1>Doctor Portal</h1>
      <p>Connected as: <code>{walletAddress}</code></p>
      <p>Status: <strong className={isVerified ? 'success' : 'error'}>
        {isVerified ? 'Verified Doctor ✓' : 'Not Verified ✗'}
      </strong></p>

      {creditBalance !== null && (
        <p>Credits: <strong className={creditBalance >= 0 ? 'success' : 'error'}>
          {creditBalance} {creditBalance < 0 ? '(owes payment)' : 'available'}
        </strong></p>
      )}

      {backendStatus && (
        <p>Backend: <strong>{backendStatus.backend}</strong> | IPFS: <strong>{backendStatus.ipfs}</strong></p>
      )}

      {message && (
        <div className={`message ${message.includes('Error') || message.includes('⚠️') ? 'error' : 'success'}`}>
          <pre>{message}</pre>
        </div>
      )}

      {/* MC Issued Success Modal */}
      {mcSuccess && (
        <div className="mc-success-modal">
          <div className="mc-success-content">
            <h2>MC Issued Successfully!</h2>

            <div className="qr-section" ref={qrRef}>
              <QRCodeSVG
                value={`${window.location.origin}/verify/${mcSuccess.ipfsHash}`}
                size={200}
                level="H"
                includeMargin={true}
              />
            </div>

            <div className="mc-details">
              <p><strong>Verification URL:</strong></p>
              <code className="url-display">{window.location.origin}/verify/{mcSuccess.ipfsHash}</code>

              <p><strong>IPFS Hash:</strong></p>
              <code className="hash-display">{mcSuccess.ipfsHash}</code>

              <p><strong>Encryption Key:</strong></p>
              <code className="key-display">{mcSuccess.encryptionKey}</code>

              <p className="warning-text">
                ⚠️ IMPORTANT: Give this encryption key to the patient to decrypt their record!
              </p>
            </div>

            <div className="mc-actions">
              <button onClick={downloadQRCode} className="download-btn">
                Download QR Code
              </button>
              <button onClick={closeMcSuccess} className="close-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="section">
        <h2>Upload Medical Record</h2>
        <form onSubmit={handleUploadRecord}>
          <div className="form-group">
            <label>Patient Wallet Address:</label>
            <input
              type="text"
              placeholder="0x..."
              value={patientAddress}
              onChange={(e) => setPatientAddress(e.target.value)}
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label>Medical Document (PDF only):</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="input-field"
              required
            />
            {selectedFile && <p>Selected: {selectedFile.name}</p>}
          </div>

          <button type="submit" disabled={loading || !isVerified || !selectedFile}>
            {loading ? 'Uploading...' : 'Upload and Encrypt'}
          </button>
        </form>
      </div>

      {/* Read Records Section */}
      <div className="section">
        <h2>Read Patient Records</h2>
        <div className="form-group">
          <input
            type="text"
            placeholder="Patient wallet address"
            value={readPatientAddress}
            onChange={(e) => setReadPatientAddress(e.target.value)}
            className="input-field"
          />
          <button onClick={handleReadRecords} disabled={loading || !readPatientAddress}>
            Request Access to Records
          </button>
        </div>
        <p className="info-text">
          Note: You can only read records if the patient has granted you access.
        </p>
      </div>
    </div>
  );
}
