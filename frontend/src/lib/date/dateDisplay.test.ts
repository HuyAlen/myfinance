import { describe, expect, it } from "vitest";
import {
  DATE_DISPLAY_FORMAT_OPTIONS, DEFAULT_DATE_DISPLAY_FORMAT,
  formatDateFromDate, formatISODateForDisplay, formatShortISODate,
  formatStoredDateForDisplay, formatTimestampForDisplay,
  isDateDisplayFormat, parseDisplayDate,
} from "./dateDisplay";

describe("MYFINANCE-DATE-FORMAT-SSOT-1 canonical ISO date presentation", () => {
  it("supports exactly the three already persisted Settings formats", () => {
    expect(DATE_DISPLAY_FORMAT_OPTIONS.map(v=>v.value)).toEqual(["dd/mm/yyyy","mm/dd/yyyy","yyyy-mm-dd"]);
    expect(DEFAULT_DATE_DISPLAY_FORMAT).toBe("dd/mm/yyyy");
    expect(isDateDisplayFormat("unknown")).toBe(false);
  });
  it.each([
    ["dd/mm/yyyy","21/10/1994"],["mm/dd/yyyy","10/21/1994"],["yyyy-mm-dd","1994-10-21"],
  ] as const)("renders and parses %s without changing the stored day",(format,label)=>{
    expect(formatISODateForDisplay("1994-10-21",format)).toBe(label);
    expect(parseDisplayDate(label,format)).toBe("1994-10-21");
  });
  it("does not parse invalid dates, calendar overflow, strings or locale ambiguity",()=>{
    for (const value of ["31/02/2026","29/02/2026","31/04/2026","13/13/2026","99/01/2026","2026-02-31", "21/10/1994<script>"]){
      expect(parseDisplayDate(value,"dd/mm/yyyy")).toBeNull();
    }
    expect(parseDisplayDate("29/02/2028","dd/mm/yyyy")).toBe("2028-02-29");
    expect(parseDisplayDate("02/29/2028","mm/dd/yyyy")).toBe("2028-02-29");
    expect(parseDisplayDate("2028-02-29","yyyy-mm-dd")).toBe("2028-02-29");
    expect(parseDisplayDate("10/21/1994","dd/mm/yyyy")).toBeNull();
    expect(parseDisplayDate("21/10/1994","mm/dd/yyyy")).toBeNull();
    expect(formatISODateForDisplay("2026-02-31","dd/mm/yyyy")).toBe("2026-02-31");
  });
  it("preserves local-day semantics and year-less transaction labels",()=>{
    expect(formatDateFromDate(new Date(2026,9,13,0,1),"dd/mm/yyyy")).toBe("13/10/2026");
    expect(formatDateFromDate(new Date(2026,9,13,0,1),"mm/dd/yyyy")).toBe("10/13/2026");
    expect(formatShortISODate("2026-10-13","dd/mm/yyyy")).toBe("13/10");
    expect(formatShortISODate("2026-10-13","mm/dd/yyyy")).toBe("10/13");
    expect(formatShortISODate("2026-10-13","yyyy-mm-dd")).toBe("10-13");
    expect(formatStoredDateForDisplay("2026-10-13","yyyy-mm-dd")).toBe("2026-10-13");
  });
  it("formats timestamps only for presentation and leaves invalid values unchanged",()=>{
    expect(formatTimestampForDisplay("not-a-date","dd/mm/yyyy")).toBe("not-a-date");
    expect(formatDateFromDate(new Date(Number.NaN),"dd/mm/yyyy")).toBe("");
  });
});
