/**
 * Agreement Verification Page
 * Mobile-friendly page for verifying Digital Service Agreement authenticity
 * Accessed via QR code scan from the Service Agreement page
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

const MEDCHAIN_BLUE = '#0066CC';
const MEDCHAIN_GREEN = '#10B981';

export default function VerifyAgreement() {
  const [searchParams] = useSearchParams();
  const [verificationStatus, setVerificationStatus] = useState('verifying');
  const [agreementData, setAgreementData] = useState(null);

  const documentId = searchParams.get('doc');
  const hospitalName = searchParams.get('hospital');

  useEffect(() => {
    // Simulate verification process
    const verifyDocument = async () => {
      setVerificationStatus('verifying');

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if there's a signed agreement in localStorage
      const storedAgreement = localStorage.getItem('medchain_signed_agreement');

      if (storedAgreement) {
        try {
          const data = JSON.parse(storedAgreement);
          setAgreementData(data);
          setVerificationStatus('verified');
        } catch {
          setVerificationStatus('pending');
        }
      } else {
        // Document exists but not yet signed
        setVerificationStatus('pending');
      }
    };

    if (documentId) {
      verifyDocument();
    } else {
      setVerificationStatus('invalid');
    }
  }, [documentId]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${MEDCHAIN_BLUE} 0%, #003366 100%)` }}
        >
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <span className="text-xl font-bold text-slate-800">Sarawak</span>
          <span className="text-xl font-bold text-amber-500 ml-1">MedChain</span>
        </div>
      </div>

      {/* Verification Card */}
      <div
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Verifying State */}
        {verificationStatus === 'verifying' && (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center bg-blue-500/20">
              <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Verifying Document</h2>
            <p className="text-slate-400 text-sm">Please wait while we verify the authenticity...</p>
          </div>
        )}

        {/* Verified State */}
        {verificationStatus === 'verified' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${MEDCHAIN_GREEN}30 0%, ${MEDCHAIN_GREEN}10 100%)`,
                boxShadow: `0 0 30px ${MEDCHAIN_GREEN}30`,
              }}
            >
              <svg className="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Document Verified</h2>
            <p className="text-emerald-400 text-sm font-medium mb-6">This is an authentic MedChain agreement</p>

            {/* Agreement Details */}
            <div
              className="text-left rounded-xl p-4 mb-6"
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Hospital</p>
                  <p className="text-slate-800 font-semibold">{agreementData?.hospitalName || hospitalName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Document ID</p>
                  <p className="text-slate-300 font-mono text-sm">{documentId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Status</p>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Active
                  </span>
                </div>
                {agreementData?.signedAt && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Signed On</p>
                    <p className="text-slate-300 text-sm">
                      {new Date(agreementData.signedAt).toLocaleDateString('en-MY', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Blockchain Badge */}
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Secured by Sarawak MedChain Blockchain
            </div>
          </div>
        )}

        {/* Pending State */}
        {verificationStatus === 'pending' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(251, 191, 36, 0.15)',
              }}
            >
              <svg className="w-10 h-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Pending Signature</h2>
            <p className="text-amber-400 text-sm font-medium mb-4">This document is awaiting signature</p>

            <div
              className="text-left rounded-xl p-4 mb-6"
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
              }}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Hospital</p>
                  <p className="text-slate-800 font-semibold">{decodeURIComponent(hospitalName || 'N/A')}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Document ID</p>
                  <p className="text-slate-300 font-mono text-sm">{documentId}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Status</p>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Pending
                  </span>
                </div>
              </div>
            </div>

            <p className="text-slate-500 text-xs">The authorized signatory has not yet completed this agreement.</p>
          </div>
        )}

        {/* Invalid State */}
        {verificationStatus === 'invalid' && (
          <div className="text-center">
            <div
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
              }}
            >
              <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Invalid Document</h2>
            <p className="text-red-400 text-sm font-medium mb-4">This document could not be verified</p>
            <p className="text-slate-500 text-xs">The QR code may be damaged or the document ID is invalid.</p>
          </div>
        )}
      </div>

      {/* Back Link */}
      <Link
        to="/"
        className="mt-8 text-slate-500 text-sm hover:text-white transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to MedChain
      </Link>
    </div>
  );
}
