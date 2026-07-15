import Papa from 'papaparse';

export async function exportToDrive(data: any[], fileName: string, accessToken: string) {
  if (!accessToken) {
    throw new Error("Missing Google Drive access token. User might need to login again.");
  }

  // Ensure user confirms this destructive/creation act, but we'll do the confirmation in the UI layer before calling this.
  
  // Format data as CSV
  const csvStr = Papa.unparse(data);

  // We'll create a new file in the user's Drive. 
  // Multipart upload to Google Drive API
  const metadata = {
    name: fileName,
    mimeType: 'text/csv'
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([csvStr], { type: 'text/csv' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to upload to Google Drive: ${err}`);
  }

  const result = await response.json();
  return result;
}
