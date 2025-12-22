import { useState, useEffect } from 'react';
import { isVerifiedDoctor, writeRecord, readRecords } from '../utils/contract';
import { uploadMedicalRecord, checkStatus } from '../utils/api';

export default function DoctorPortal({ walletAddress }) {
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [backendStatus, setBackendStatus] = useState(null);

  // Upload form state
  const [patientAddress, setPatientAddress] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Read records state
  const [readPatientAddress, setReadPatientAddress] = useState('');
  const [patientRecords, setPatientRecords] = useState([]);

  useEffect(() => {
    checkDoctorStatus();
    checkBackendStatus();
  }, [walletAddress]);

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

      setMessage(`✓ Record uploaded successfully!\n\nIPFS Hash: ${ipfsHash}\nEncryption Key: ${encryptionKey}\n\n⚠️ IMPORTANT: Give this encryption key to the patient to decrypt their record!`);

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

      {backendStatus && (
        <p>Backend: <strong>{backendStatus.backend}</strong> | IPFS: <strong>{backendStatus.ipfs}</strong></p>
      )}

      {message && (
        <div className={`message ${message.includes('Error') || message.includes('⚠️') ? 'error' : 'success'}`}>
          <pre>{message}</pre>
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
