const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateAssessmentReport(assessment, controls, project, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Header
    doc.rect(0, 0, doc.page.width, 100).fill('#2c3e50');
    doc.fontSize(22).fillColor('white').text('Security Assessment Report', 50, 30);
    doc.fontSize(12).text(`ITSG-33 / Protected B – ${project.name}`, 50, 60);

    doc.moveDown(4);
    doc.fillColor('#333');

    // Project info
    doc.fontSize(14).fillColor('#2c3e50').text('Project Information', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    doc.text(`Project: ${project.name}`);
    doc.text(`Classification: ${(project.data_classification || 'Protected B').toUpperCase()}`);
    doc.text(`Hosting: ${project.hosting_type || 'N/A'}`);
    doc.text(`Application Type: ${project.app_type || 'N/A'}`);
    doc.text(`PII: ${project.has_pii ? 'Yes' : 'No'}`);
    doc.text(`Assessment Date: ${new Date(assessment.created_at).toLocaleDateString('en-CA')}`);
    if (assessment.overall_score !== null && assessment.overall_score !== undefined) {
      doc.text(`Overall Score: ${assessment.overall_score}%`);
    }
    doc.text(`Result: ${(assessment.result || 'Pending').toUpperCase()}`);

    doc.moveDown(1);
    doc.fontSize(14).fillColor('#2c3e50').text('Control Assessment Summary', { underline: true });
    doc.moveDown(0.5);

    const met = controls.filter(c => c.audit_result === 'met').length;
    const partial = controls.filter(c => c.audit_result === 'partially-met').length;
    const notMet = controls.filter(c => c.audit_result === 'not-met').length;
    const pending = controls.filter(c => !c.audit_result || c.audit_result === 'pending').length;
    const na = controls.filter(c => !c.is_applicable).length;

    doc.fontSize(10).fillColor('#333');
    doc.text(`Total Controls: ${controls.length}`);
    doc.text(`Met: ${met}  |  Partially Met: ${partial}  |  Not Met: ${notMet}  |  Pending: ${pending}  |  N/A: ${na}`);

    doc.moveDown(1);

    // Controls by family
    let currentFamily = '';
    controls.forEach(control => {
      if (doc.y > 680) doc.addPage();

      if (control.family !== currentFamily) {
        currentFamily = control.family;
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor('#2c3e50').text(`${control.family} – ${control.family_name}`, { underline: true });
        doc.moveDown(0.3);
      }

      const statusColor = control.audit_result === 'met' ? '#27ae60'
        : control.audit_result === 'partially-met' ? '#f39c12'
        : control.audit_result === 'not-met' ? '#e74c3c' : '#6c757d';

      doc.fontSize(10).fillColor('#333');
      doc.text(`${control.control_id} – ${control.title}`, { continued: false });
      doc.fontSize(9).fillColor(statusColor);
      doc.text(`  Status: ${(control.audit_result || 'Pending').toUpperCase()}`, { indent: 20 });

      if (control.is_inherited) {
        doc.fillColor('#3498db').text(`  Inherited from: ${control.inherited_from || 'Shared services'}`, { indent: 20 });
      }
      if (control.audit_comments) {
        doc.fillColor('#6c757d').text(`  Comments: ${control.audit_comments}`, { indent: 20 });
      }
      doc.moveDown(0.3);
    });

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

function generateATODocument(assessment, project, atoType, controls, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Official header
    doc.rect(0, 0, doc.page.width, 80).fill('#2c3e50');
    doc.fontSize(18).fillColor('white').text('GOVERNMENT OF CANADA', 50, 20, { align: 'center' });
    doc.fontSize(14).text(`${atoType === 'ato' ? 'Authority to Operate' : 'Interim Authority to Operate'}`, { align: 'center' });

    doc.moveDown(5);
    doc.fillColor('#333');

    doc.fontSize(14).fillColor('#2c3e50').text('Authorization Details', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`System Name: ${project.name}`);
    doc.text(`Security Classification: ${(project.data_classification || 'Protected B').toUpperCase()}`);
    doc.text(`Assessment Date: ${new Date(assessment.audit_completed_at || assessment.created_at).toLocaleDateString('en-CA')}`);
    if (atoType === 'iato' && assessment.ato_expiry_date) {
      doc.text(`Expiry Date: ${new Date(assessment.ato_expiry_date).toLocaleDateString('en-CA')}`);
    }

    const met = controls.filter(c => c.audit_result === 'met').length;
    const total = controls.filter(c => c.is_applicable).length;
    doc.text(`Controls Met: ${met} of ${total} (${total > 0 ? Math.round(met/total*100) : 0}%)`);

    doc.moveDown(1);
    doc.fontSize(11);
    if (atoType === 'ato') {
      doc.text('Based on the security assessment conducted, the system has been found to meet the required security controls for Protected B, Medium Integrity, Medium Availability (PBMM) as defined in ITSG-33. This Authority to Operate authorizes the system for operational use.');
    } else {
      doc.text('Based on the security assessment conducted, the system has been granted an Interim Authority to Operate. The outstanding items identified in the attached checklist must be remediated by the specified deadlines. Failure to address these items may result in revocation of this authorization.');
    }

    doc.moveDown(2);

    // Signature blocks
    const sigY = doc.y;
    doc.fontSize(11).fillColor('#333');
    
    doc.text('_________________________________', 50, sigY);
    doc.text(`Security Assessor`, 50, sigY + 15);
    doc.text(`Date: ____________________`, 50, sigY + 30);

    doc.text('_________________________________', 320, sigY);
    doc.text(`Project Authority`, 320, sigY + 15);
    doc.text(`Date: ____________________`, 320, sigY + 30);

    doc.text('_________________________________', 50, sigY + 70);
    doc.text(`Chief Information Officer`, 50, sigY + 85);
    doc.text(`Date: ____________________`, 50, sigY + 100);

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generateAssessmentReport, generateATODocument };
