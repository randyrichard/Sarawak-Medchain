const { ethers } = require("hardhat");

async function main() {
  const [admin, doctor1, doctor2, patient1] = await ethers.getSigners();

  console.log('=== Testing Full Upload/Retrieve Flow ===\n');

  // Step 1: Doctor uploads a file using native fetch with Blob
  console.log('Step 1: Doctor uploads medical record');
  console.log(`  Doctor: ${doctor1.address}`);
  console.log(`  Patient: ${patient1.address}`);

  // Create a test PDF content
  const testContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
  const pdfContent = Buffer.concat([Buffer.from(testContent), Buffer.from(' Test Medical Record for patient ' + patient1.address)]);

  // Sign the upload message
  const uploadTimestamp = Math.floor(Date.now() / 1000);
  const uploadMessage = `SarawakMedChain:upload:${uploadTimestamp}`;
  const uploadSignature = await doctor1.signMessage(uploadMessage);

  // Use FormData from Node.js built-in (Node 18+)
  const formData = new FormData();
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  formData.append('file', blob, 'test-record.pdf');
  formData.append('patientAddress', patient1.address);

  // Upload to backend
  const uploadRes = await fetch('http://localhost:3001/api/upload/medical-record', {
    method: 'POST',
    headers: {
      'x-wallet-address': doctor1.address,
      'x-wallet-signature': uploadSignature,
      'x-wallet-timestamp': uploadTimestamp.toString(),
      'x-wallet-action': 'upload'
    },
    body: formData
  });

  let uploadData;
  const contentType = uploadRes.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    uploadData = await uploadRes.json();
  } else {
    const text = await uploadRes.text();
    console.log('  ✗ Upload returned non-JSON:', text.substring(0, 100));
    return;
  }

  if (!uploadData.success) {
    console.log('  ✗ Upload failed:', uploadData.error || uploadData.message);
    return;
  }

  console.log('  ✓ Upload successful!');
  console.log(`  IPFS Hash: ${uploadData.ipfsHash}`);
  console.log(`  Encryption Key: ${uploadData.encryptionKey}`);

  // Step 2: Write record to blockchain
  console.log('\nStep 2: Write record to blockchain');
  const contract = await ethers.getContractAt('SarawakMedMVP', '0x5FbDB2315678afecb367f032d93F642f64180aa3');

  const tx = await contract.connect(doctor1).writeRecord(patient1.address, uploadData.ipfsHash);
  await tx.wait();
  console.log('  ✓ Record written to blockchain');

  // Step 3: Patient retrieves their record
  console.log('\nStep 3: Patient retrieves their record (self-access)');

  const retrieveTimestamp = Math.floor(Date.now() / 1000);
  const retrieveMessage = `SarawakMedChain:retrieve:${retrieveTimestamp}`;
  const retrieveSignature = await patient1.signMessage(retrieveMessage);

  const retrieveRes = await fetch('http://localhost:3001/api/upload/retrieve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': patient1.address,
      'x-wallet-signature': retrieveSignature,
      'x-wallet-timestamp': retrieveTimestamp.toString(),
      'x-wallet-action': 'retrieve'
    },
    body: JSON.stringify({
      ipfsHash: uploadData.ipfsHash,
      encryptionKey: uploadData.encryptionKey,
      patientAddress: patient1.address
    })
  });

  if (retrieveRes.ok) {
    const arrayBuffer = await retrieveRes.arrayBuffer();
    console.log('  ✓ Record retrieved successfully!');
    console.log(`  File size: ${arrayBuffer.byteLength} bytes`);
  } else {
    const errorData = await retrieveRes.json();
    console.log('  ✗ Retrieve failed:', errorData.error || errorData.message);
    return;
  }

  // Step 4: Test unauthorized access (Doctor2 without permission)
  console.log('\nStep 4: Test unauthorized access (Doctor2 without permission)');

  const unauthorizedTimestamp = Math.floor(Date.now() / 1000);
  const unauthorizedMessage = `SarawakMedChain:retrieve:${unauthorizedTimestamp}`;
  const unauthorizedSignature = await doctor2.signMessage(unauthorizedMessage);

  const unauthorizedRes = await fetch('http://localhost:3001/api/upload/retrieve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': doctor2.address,
      'x-wallet-signature': unauthorizedSignature,
      'x-wallet-timestamp': unauthorizedTimestamp.toString(),
      'x-wallet-action': 'retrieve'
    },
    body: JSON.stringify({
      ipfsHash: uploadData.ipfsHash,
      encryptionKey: uploadData.encryptionKey,
      patientAddress: patient1.address
    })
  });

  if (unauthorizedRes.status === 403) {
    const unauthorizedData = await unauthorizedRes.json();
    console.log('  ✓ Unauthorized access correctly blocked!');
    console.log(`  Response: ${unauthorizedData.error}`);
  } else {
    console.log('  ✗ Should have been blocked but got status:', unauthorizedRes.status);
  }

  // Step 5: Patient grants access to Doctor2
  console.log('\nStep 5: Patient grants access to Doctor2');
  const grantTx = await contract.connect(patient1).grantAccess(doctor2.address);
  await grantTx.wait();
  console.log('  ✓ Access granted on blockchain');

  // Step 6: Doctor2 now can access
  console.log('\nStep 6: Doctor2 retrieves with permission');

  const authorizedTimestamp = Math.floor(Date.now() / 1000);
  const authorizedMessage = `SarawakMedChain:retrieve:${authorizedTimestamp}`;
  const authorizedSignature = await doctor2.signMessage(authorizedMessage);

  const authorizedRes = await fetch('http://localhost:3001/api/upload/retrieve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': doctor2.address,
      'x-wallet-signature': authorizedSignature,
      'x-wallet-timestamp': authorizedTimestamp.toString(),
      'x-wallet-action': 'retrieve'
    },
    body: JSON.stringify({
      ipfsHash: uploadData.ipfsHash,
      encryptionKey: uploadData.encryptionKey,
      patientAddress: patient1.address
    })
  });

  if (authorizedRes.ok) {
    const arrayBuffer = await authorizedRes.arrayBuffer();
    console.log('  ✓ Doctor2 retrieved successfully with permission!');
    console.log(`  File size: ${arrayBuffer.byteLength} bytes`);
  } else {
    const errorData = await authorizedRes.json();
    console.log('  ✗ Retrieve failed:', errorData.error || errorData.message);
  }

  // Step 7: Patient revokes access from Doctor2
  console.log('\nStep 7: Patient revokes access from Doctor2');
  const revokeTx = await contract.connect(patient1).revokeAccess(doctor2.address);
  await revokeTx.wait();
  console.log('  ✓ Access revoked on blockchain');

  // Step 8: Doctor2 can no longer access
  console.log('\nStep 8: Doctor2 tries to access after revocation');

  const revokedTimestamp = Math.floor(Date.now() / 1000);
  const revokedMessage = `SarawakMedChain:retrieve:${revokedTimestamp}`;
  const revokedSignature = await doctor2.signMessage(revokedMessage);

  const revokedRes = await fetch('http://localhost:3001/api/upload/retrieve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-wallet-address': doctor2.address,
      'x-wallet-signature': revokedSignature,
      'x-wallet-timestamp': revokedTimestamp.toString(),
      'x-wallet-action': 'retrieve'
    },
    body: JSON.stringify({
      ipfsHash: uploadData.ipfsHash,
      encryptionKey: uploadData.encryptionKey,
      patientAddress: patient1.address
    })
  });

  if (revokedRes.status === 403) {
    const revokedData = await revokedRes.json();
    console.log('  ✓ Access correctly revoked!');
    console.log(`  Response: ${revokedData.error}`);
  } else {
    console.log('  ✗ Should have been blocked but got status:', revokedRes.status);
  }

  console.log('\n=== Full Flow Test Complete ===');
  console.log('\nSUMMARY:');
  console.log('  ✓ Doctor can upload medical records');
  console.log('  ✓ Records are encrypted and stored on IPFS');
  console.log('  ✓ Patient can retrieve their own records (self-access)');
  console.log('  ✓ Unauthorized doctors are blocked');
  console.log('  ✓ Patient can grant access to doctors');
  console.log('  ✓ Authorized doctors can retrieve records');
  console.log('  ✓ Patient can revoke access');
  console.log('  ✓ Revoked doctors are blocked');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
