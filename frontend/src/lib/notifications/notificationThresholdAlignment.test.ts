import { describe, expect, it } from "vitest";
import { buildFinanceNotifications } from "./financeNotifications";
import type { Budget, Category, Debt, Goal, Transaction } from "@/src/types/finance";
const category: Category = {id:"food",name:"Food",type:"expense",planningGroup:"variable"};
const budget: Budget = {id:"b1",categoryId:"food",month:"2026-10",limitAmount:1000};
const debt: Debt = {id:"d1",name:"Mortgage",totalAmount:2000,remainingAmount:1000};
const goal: Goal = {id:"g1",name:"Emergency",targetAmount:1000,currentAmount:0};
const expense = (amount:number): Transaction=>({id:"e",type:"expense",amount,categoryId:"food",walletId:"w1",date:"2026-10-01",note:""});
const income = (amount:number): Transaction=>({id:"i",type:"income",amount,categoryId:"salary",walletId:"w1",date:"2026-10-01",note:""});
const opts = {budgetAlertPercent:80,debtAlertPercent:50,goalMilestones:true};
const build = (over: Partial<Parameters<typeof buildFinanceNotifications>[0]>) => buildFinanceNotifications({
  budgets:[],transactions:[],categories:[category],goals:[],debts:[],currentMonth:"2026-10",maxNotifications:100,
  ...opts,...over,
});
describe("MYFINANCE-NOTIFICATION-THRESHOLD-ALIGNMENT-1 behavior",()=>{
  it("user budget threshold uses RAW canonical spending rather than rounded display percent",()=>{
    const notification = (amount:number) => build({budgets:[budget],transactions:[expense(amount)]}).filter(n=>n.id.startsWith("b"));
    expect(notification(799)).toHaveLength(0);
    expect(notification(800).map(n=>n.id)).toEqual(["bnear-b1"]);
    expect(build({budgets:[budget],transactions:[expense(900)],budgetAlertPercent:95}).filter(n=>n.id.startsWith("b"))).toHaveLength(0);
    expect(build({budgets:[budget],transactions:[expense(1000)],budgetAlertPercent:100}).map(n=>n.id)).toContain("batlimit-b1");
    expect(build({budgets:[budget],transactions:[expense(1001)],budgetAlertPercent:100}).map(n=>n.id)).toContain("bover-b1");
  });
  it("goal 25/50/75/100 stages use effective canonical funding, one current stage at a time",()=>{
    const get = (progress:number) => build({goals:[{...goal,currentAmount:progress}]}).filter(n=>n.id.startsWith("g"));
    expect(get(249)).toHaveLength(0);
    expect(get(250).map(n=>n.id)).toEqual(["g25-g1"]);
    expect(get(500).map(n=>n.id)).toEqual(["g50-g1"]);
    expect(get(750).map(n=>n.id)).toEqual(["gnear-g1"]);
    expect(get(1000).map(n=>n.id)).toEqual(["gdone-g1"]);
  });
  it("debt to monthly income is only compared with positive monthly income, strict threshold and current month",()=>{
    const get = (amount:number,threshold=50,tx:Transaction[]=[income(1000)]) => build({debts:[{...debt,remainingAmount:amount}],transactions:tx,debtAlertPercent:threshold}).filter(n=>n.id.startsWith("debt-income-"));
    expect(get(500)).toHaveLength(0);
    expect(get(501)).toHaveLength(1);
    expect(get(1000,200)).toHaveLength(0);
    expect(get(1000,50,[])).toHaveLength(0);
    expect(get(1000,50,[{...income(1000),date:"2026-09-01"}])).toHaveLength(0);
    expect(get(0,0)).toHaveLength(0);
  });
  it("legacy pure-engine defaults remain unchanged when no preference options are passed",()=>{
    const result = buildFinanceNotifications({budgets:[budget],transactions:[expense(820)],categories:[category],goals:[{...goal,currentAmount:400}],debts:[],currentMonth:"2026-10"});
    expect(result.some(n=>n.id.startsWith("bnear-")||n.id.startsWith("g25-"))).toBe(false);
  });
});
