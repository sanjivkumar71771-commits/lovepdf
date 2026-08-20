from fpdf import FPDF

pdf = FPDF(format="A4")
pdf.add_page()
pdf.set_font("helvetica", size=14)
pdf.cell(0, 10, "Application Form")
pdf.ln(12)
pdf.set_font("helvetica", size=11)
pdf.cell(0, 8, "Name: ______________________")
pdf.ln(10)
pdf.cell(0, 8, "Signature: __________________")
pdf.output("/tmp/test_form.pdf")
print("ok")
