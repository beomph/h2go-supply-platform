#!/usr/bin/env python3
"""물량확인증을 HWPX 형식으로 생성하는 스크립트"""
import os
import sys

def main():
    try:
        from hwpx import HwpxDocument
    except ImportError:
        print("python-hwpx가 설치되어 있지 않습니다. 다음 명령으로 설치하세요:")
        print("  pip install python-hwpx")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "H2GO_통합_물량확인증.hwpx")

    print("HWPX 생성 중...")
    doc = HwpxDocument.new()

    # H2GO 로고 (부담스럽지 않게)
    doc.add_paragraph("H2GO")
    doc.add_paragraph("")

    # 제목
    doc.add_paragraph("물량확인증")
    doc.add_paragraph("")

    # 입출고 일자
    doc.add_paragraph("입고 일자: _____________ 년 _____ 월 _____ 일    출고 일자: _____________ 년 _____ 월 _____ 일")
    doc.add_paragraph("")

    # 고객
    doc.add_paragraph("⊙ 고객")
    doc.add_paragraph("고객명: _________________________________________________")
    doc.add_paragraph("주소: _________________________________________________")
    doc.add_paragraph("전화번호: _________________________________________________")
    doc.add_paragraph("")

    # 공급자
    doc.add_paragraph("⊙ 공급자")
    doc.add_paragraph("공급자명: _________________________________________________")
    doc.add_paragraph("주소: _________________________________________________")
    doc.add_paragraph("전화번호: _________________________________________________")
    doc.add_paragraph("")

    # 수소 튜브트레일러 정보
    doc.add_paragraph("⊙ 수소 튜브트레일러 정보")
    doc.add_paragraph("차량 번호: _______________    내용적: _______________ m³")
    doc.add_paragraph("")

    # 거래 내역 - 유량계 정산
    doc.add_paragraph("⊙ 거래 내역")
    doc.add_paragraph("(1) 유량계 정산")
    tbl1 = doc.add_table(rows=3, cols=2)
    tbl1.set_cell_text(0, 0, "입고 (A)")
    tbl1.set_cell_text(0, 1, "출고 (B)")
    tbl1.set_cell_text(1, 0, "")
    tbl1.set_cell_text(1, 1, "")
    tbl1.set_cell_text(2, 0, "")
    tbl1.set_cell_text(2, 1, "")
    doc.add_paragraph("사용량: 출고 지침값 (B) - 입고 지침값 (A)")
    doc.add_paragraph("사용량 A: ___________   사용량 B: ___________   합계: ___________")
    doc.add_paragraph("")

    # 차압 정산
    doc.add_paragraph("(2) 차압 정산")
    tbl2 = doc.add_table(rows=2, cols=2)
    tbl2.set_cell_text(0, 0, "입고 압력 (A) bar")
    tbl2.set_cell_text(0, 1, "출고 압력 (B) bar")
    tbl2.set_cell_text(1, 0, "")
    tbl2.set_cell_text(1, 1, "")
    doc.add_paragraph("사용량: ___________")
    doc.add_paragraph("▶ 사용량 산정식: (출고 압력 - 입고 압력, bar) × 내용적 (m³)")
    doc.add_paragraph("")

    # 계량기 방식
    doc.add_paragraph("(3) 계량기 방식 (선택)")
    doc.add_paragraph("충전전 중량: ___________ kg   충전후 중량: ___________ kg   충전량: ___________ kg")
    doc.add_paragraph("")

    # 입출고 확인
    doc.add_paragraph("⊙ 입출고 확인")
    tbl3 = doc.add_table(rows=4, cols=3)
    tbl3.set_cell_text(0, 0, "구분")
    tbl3.set_cell_text(0, 1, "성명")
    tbl3.set_cell_text(0, 2, "서명")
    tbl3.set_cell_text(1, 0, "고객")
    tbl3.set_cell_text(1, 1, "")
    tbl3.set_cell_text(1, 2, "")
    tbl3.set_cell_text(2, 0, "입고 기사")
    tbl3.set_cell_text(2, 1, "")
    tbl3.set_cell_text(2, 2, "")
    tbl3.set_cell_text(3, 0, "출고 기사")
    tbl3.set_cell_text(3, 1, "")
    tbl3.set_cell_text(3, 2, "")
    doc.add_paragraph("")

    # 푸터
    doc.add_paragraph("(공급받는자 보관용)                                                    H2GO")

    doc.save_to_path(output_path)
    print(f"완료: {output_path}")
    print("한글에서 열어 '다른 이름으로 저장' → HWP 형식으로 저장할 수 있습니다.")

if __name__ == "__main__":
    main()
