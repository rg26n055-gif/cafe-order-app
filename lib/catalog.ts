export const catalog = [
  { id:'donut', name:'ドーナツ', price:250, station:'kitchen', position:0, icon:'🍩' },
  { id:'cupcake', name:'カップケーキ', price:250, station:'kitchen', position:1, icon:'🧁' },
  { id:'churro', name:'チュロス', price:250, station:'kitchen', position:2, icon:'🥨' },
  { id:'float', name:'綿あめフロート', price:200, station:'float', position:3, icon:'🥤' },
  { id:'pack', name:'パック', price:50, station:'pack', position:4, icon:'🛍️' },
] as const;
export type Product = {id:string;name:string;price:number;stock:number;station:string;position:number};
export type Item = {productId:string;name:string;price:number;qty:number;station:string;doneAt:string|null};
export type Order = {id:string;usageType:string;ticketType:string;customerNumber:number;status:string;createdAt:string;paidAt:string|null;deliveredAt:string|null;items:Item[];total:number};
export type Store = {products:Product[];orders:Order[];updatedAt:string};
