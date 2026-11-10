// What Stats hands to the Report screen: the report for the nights and columns chosen there, ready
// to be made in any form. Kept here (not in the address) because it's the whole table.
import type { ReportLayout, ReportTheme } from './report';

export interface ReportDraft {
  /** The report as an HTML page: `print` for the PDF, `screen` for the .html file and the preview. */
  html: (layout: ReportLayout, theme: ReportTheme) => string;
  markdown: () => string;
}

let draft: ReportDraft | null = null;
export const setReportDraft = (d: ReportDraft) => { draft = d; };
export const getReportDraft = () => draft;
