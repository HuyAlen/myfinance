import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FormattedDateInput from "./FormattedDateInput";

const read = (file:string)=>readFileSync(resolve(process.cwd(),file),"utf8");
describe("MYFINANCE-DATE-FORMAT-SSOT-1 date picker",()=>{
  it("renders Vietnamese date text independently of browser locale, retaining native calendar",()=>{
    const html = renderToStaticMarkup(createElement(FormattedDateInput,{
      id:"birthday",value:"1994-10-21",format:"dd/mm/yyyy",onChange:()=>undefined,
      "data-account-birth-date":"true",
    }));
    expect(html).toContain('value="21/10/1994"');
    expect(html).toContain('type="text"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="1994-10-21"');
    expect(html).toContain('data-account-birth-date="true"');
    expect(html).toContain('aria-label="Chọn ngày bằng lịch"');
  });
  it("does not write a formatted UI date into Supabase or date filter storage",()=>{
    const input=read("src/components/ui/FormattedDateInput.tsx");
    expect(input).toContain('onChange(parsed ?? "")');
    expect(input).toContain("parseDisplayDate(raw,format)");
    expect(input).not.toMatch(/localStorage|supabase|\.toISOString\(/);
  });
});
