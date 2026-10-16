(() => {
  'use strict';
  const D=window.NEBULA_PROGRESS,$=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!D)return;
  const pct=value=>value==null?'Not measurable':`${value.toFixed(1)}%`;
  const latest=[...D.milestones].reverse().find(m=>m.metrics);
  function patientChart(){
    const max=Math.max(...D.milestones.map(m=>m.patients),1),base=150,bar=70,gap=38;
    return `<svg class="progress-svg" viewBox="0 0 520 190" role="img" aria-label="Patient count rose from zero in June to ${latest.patients} in October"><line x1="35" y1="${base}" x2="500" y2="${base}" class="chart-axis"/>${D.milestones.map((m,i)=>{const x=55+i*(bar+gap),h=m.patients/max*105,y=base-h;return `<g><rect x="${x}" y="${y}" width="${bar}" height="${h}" rx="4" class="patient-bar"/><text x="${x+bar/2}" y="${Math.max(20,y-8)}" class="chart-value">${m.patients}</text><text x="${x+bar/2}" y="174" class="chart-label">${esc(m.shortDate)}</text></g>`;}).join('')}</svg>`;
  }
  function outcomeChart(){
    const points=D.milestones.filter(m=>m.metrics),xs=[145,405],y=value=>145-value*1.15;
    const series=[['Top 3',points.map(m=>m.top3DiagnosisPercent),'top3-line'],['Top 1',points.map(m=>m.top1PatientPercent),'top1-line'],['Patients ≤ 0',points.map(m=>m.nonpositivePatientPercent),'nonpositive-line']];
    return `<div class="chart-legend"><span class="top3-key">Top 3</span><span class="top1-key">Top 1</span><span class="nonpositive-key">Patients ≤ 0</span></div><svg class="progress-svg" viewBox="0 0 520 190" role="img" aria-label="Top 1, Top 3, and nonpositive score percentages for October 14 and October 16">${[0,25,50,75,100].map(v=>`<g><line x1="45" y1="${y(v)}" x2="485" y2="${y(v)}" class="chart-grid"/><text x="38" y="${y(v)+4}" class="chart-tick">${v}%</text></g>`).join('')}${series.map(([,values,klass])=>`<polyline points="${values.map((v,i)=>`${xs[i]},${y(v)}`).join(' ')}" class="trend-line ${klass}"/>${values.map((v,i)=>`<g><circle cx="${xs[i]}" cy="${y(v)}" r="5" class="${klass}"/><text x="${xs[i]}" y="${y(v)-10}" class="chart-value">${v.toFixed(1)}%</text></g>`).join('')}`).join('')}${points.map((m,i)=>`<text x="${xs[i]}" y="174" class="chart-label">${esc(m.shortDate)}</text>`).join('')}</svg>`;
  }
  function render(){
    $('progress-updated').textContent=`Updated ${D.updated}`;
    $('progress-highlights').innerHTML=`<article class="panel"><span>Current cohort</span><strong>${latest.patients}</strong><small>${latest.recordedDiagnoses} recorded diagnoses</small></article><article class="panel"><span>Top 1</span><strong>${pct(latest.top1PatientPercent)}</strong><small>recorded class ranked first</small></article><article class="panel"><span>Top 3</span><strong>${pct(latest.top3DiagnosisPercent)}</strong><small>patient-balanced recorded-class recall</small></article><article class="panel"><span>Patients at ≤ 0</span><strong>${latest.nonpositivePatients}</strong><small>${pct(latest.nonpositivePatientPercent)} of current cohort</small></article>`;
    $('patient-growth-chart').innerHTML=patientChart();$('outcome-trend-chart').innerHTML=outcomeChart();
    $('progress-table-body').innerHTML=D.milestones.map(m=>`<tr><td><strong>${esc(m.date)}</strong></td><td><strong>${esc(m.name)}</strong><small>${esc(m.note)}</small></td><td>${m.patients}</td><td>${m.recordedDiagnoses}</td><td>${pct(m.top1PatientPercent)}</td><td>${pct(m.top3DiagnosisPercent)}</td><td>${m.nonpositivePatients==null?'Not measurable':`${m.nonpositivePatients} (${pct(m.nonpositivePatientPercent)})`}</td><td>${m.meanRecordedRank==null?'Not measurable':m.meanRecordedRank.toFixed(2)}</td><td>${m.scoredQuestions} scored questions<small>${m.rules} answer rules</small></td></tr>`).join('');
    $('progress-definitions').innerHTML=`<p><strong>Top 1:</strong> ${esc(D.definitions.top1)}</p><p><strong>Top 3:</strong> ${esc(D.definitions.top3)}</p><p><strong>Patients ≤ 0:</strong> ${esc(D.definitions.nonpositive)}</p><p>${esc(D.definitions.scope)} June percentages are shown as “Not measurable” because no labeled patient outputs existed yet; they are not treated as zero performance.</p><p>Only aggregate counts and percentages are published on this page. No patient-level data is included.</p>`;
  }
  document.addEventListener('nebula:progress-open',render);render();
})();
