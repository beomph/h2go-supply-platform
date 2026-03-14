#!/usr/bin/env python3
"""물량확인증 HTML을 PDF로 변환하는 스크립트"""
import os
import sys

def main():
    try:
        from xhtml2pdf import pisa
    except ImportError:
        print("xhtml2pdf가 설치되어 있지 않습니다. 다음 명령으로 설치하세요:")
        print("  pip install xhtml2pdf")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    html_path = os.path.join(script_dir, "물량확인증_양식_pdf.html")
    if not os.path.exists(html_path):
        html_path = os.path.join(script_dir, "물량확인증_양식.html")
    pdf_path = os.path.join(script_dir, "H2GO_통합_물량확인증.pdf")

    if not os.path.exists(html_path):
        print(f"오류: {html_path} 파일을 찾을 수 없습니다.")
        sys.exit(1)

    print("PDF 생성 중...")
    with open(html_path, "r", encoding="utf-8") as src:
        html = src.read()
    # 이미지를 base64로 인라인 (xhtml2pdf 경로 이슈 대응)
    logo_path = os.path.join(script_dir, "assets", "H2GO_logo.png")
    if os.path.exists(logo_path):
        import base64
        with open(logo_path, "rb") as f:
            raw = f.read()
            logo_b64 = base64.b64encode(raw).decode()
        mime = "image/jpeg" if raw[:2] == b"\xff\xd8" else "image/png"
        html = html.replace(
            'src="assets/H2GO_logo.png"',
            f'src="data:{mime};base64,{logo_b64}"'
        )
    with open(pdf_path, "w+b") as dest:
        status = pisa.CreatePDF(html.encode("utf-8"), dest=dest, encoding="utf-8")
    if status.err:
        print("PDF 생성 중 오류가 발생했습니다.")
        sys.exit(1)
    print(f"완료: {pdf_path}")

if __name__ == "__main__":
    main()
