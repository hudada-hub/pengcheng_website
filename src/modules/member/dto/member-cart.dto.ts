/** 购物车条目（无语言上下文时的精简字段） */
export class MemberCartItemDto {
  itemId: number;
  productId: number;
  qty: number;
}

/** 产品参数展示：分类名 + 参数项名 + 可选值文案 */
export class MemberCartItemAttributeDto {
  categoryId: number;
  categoryTitle: string;
  valueId: number;
  valueTitle: string;
  value: string | null;
}

/** 购物车列表（含展示字段，需传 locale 解析 langId） */
export class MemberCartItemDetailDto extends MemberCartItemDto {
  title: string;
  thumbUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  attributes: MemberCartItemAttributeDto[];
}

/** 某分类下可选参数维度及取值（用于抽屉内换型） */
export class CartParamValueOptionDto {
  id: number;
  title: string;
  value: string | null;
}

export class CartParamCategoryOptionDto {
  categoryId: number;
  categoryTitle: string;
  values: CartParamValueOptionDto[];
}

/** 游客合并入参单项 */
export class MemberCartMergeGuestItemDto {
  productId: number;
  qty: number;
}
