import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import type {
  BenefitDefinitionRow,
  BeverageOptionRow,
  SouvenirOptionGroupRow,
  SouvenirOptionRow,
} from '../../db/types.js';

export interface ResolvedBeverage {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export interface ResolvedSouvenirSelection {
  optionGroupId: string;
  groupCode: string;
  groupName: string;
  optionId: string;
  optionCode: string;
  optionName: string;
  quantity: number;
  groupSnapshot: Record<string, unknown>;
  optionSnapshot: Record<string, unknown>;
}

export class CatalogService {
  constructor(private readonly db: Database) {}

  async listBeverageOptions(): Promise<BeverageOptionRow[]> {
    const { rows } = await this.db.query<BeverageOptionRow>(
      `SELECT id, code, name, description, image_url, active, display_order
         FROM beverage_options
        WHERE active = TRUE
        ORDER BY display_order, name`,
    );
    return rows;
  }

  /** Public: groups plus their active options, fully dynamic (BR-SOU-06). */
  async listSouvenirOptionGroups() {
    const { rows: groups } = await this.db.query<SouvenirOptionGroupRow>(
      `SELECT id, code, name, description, selection_min, selection_max, display_order, active
         FROM souvenir_option_groups
        WHERE active = TRUE
        ORDER BY display_order, name`,
    );
    if (groups.length === 0) return [];

    const { rows: options } = await this.db.query<SouvenirOptionRow>(
      `SELECT id, option_group_id, code, name, description, image_url, metadata,
              display_order, active
         FROM souvenir_options
        WHERE active = TRUE
        ORDER BY display_order, name`,
    );

    return groups.map((group) => ({
      id: group.id,
      code: group.code,
      name: group.name,
      description: group.description,
      selectionMin: group.selection_min,
      selectionMax: group.selection_max,
      displayOrder: group.display_order,
      options: options
        .filter((option) => option.option_group_id === group.id)
        .map((option) => ({
          id: option.id,
          code: option.code,
          name: option.name,
          description: option.description,
          imageUrl: option.image_url,
          metadata: option.metadata,
          displayOrder: option.display_order,
        })),
    }));
  }

  /**
   * Benefits configured for an offer (BR-BEN-02).
   *
   * This is genuinely configuration driven: `benefit_definitions` rows decide
   * which entitlements an offer carries, in what quantity, and whether the
   * customer must choose. Nothing about Presale is hardcoded.
   */
  async offerBenefits(
    client: Pick<import('pg').PoolClient, 'query'>,
    offerId: string,
  ): Promise<BenefitDefinitionRow[]> {
    const { rows } = await client.query<BenefitDefinitionRow>(
      `SELECT * FROM benefit_definitions
        WHERE ticket_offer_id = $1
        ORDER BY sort_order, benefit_type`,
      [offerId],
    );
    return rows;
  }

  /**
   * A beverage choice is required when the offer has a mandatory BEVERAGE
   * benefit sourced from the beverage catalog. Returns the definition so the
   * chosen option can be recorded against it.
   */
  async mandatoryBeverageBenefit(
    client: Pick<import('pg').PoolClient, 'query'>,
    offerId: string,
  ): Promise<BenefitDefinitionRow | null> {
    const benefits = await this.offerBenefits(client, offerId);
    return (
      benefits.find(
        (benefit) =>
          benefit.benefit_type === 'BEVERAGE' &&
          benefit.is_mandatory &&
          benefit.source_type === 'BEVERAGE_OPTIONS',
      ) ?? null
    );
  }

  /** Step 7: mandatory beverage from the dynamic catalog. */
  async resolveBeverage(
    client: Pick<import('pg').PoolClient, 'query'>,
    optionId: string | null | undefined,
    definition: BenefitDefinitionRow | null,
  ): Promise<ResolvedBeverage | null> {
    const required = definition !== null;
    if (!optionId) {
      if (required) {
        throw new AppError(
          'BEVERAGE_REQUIRED',
          `A beverage choice is required for "${definition.name}".`,
          422,
          { benefit: definition.benefit_type },
        );
      }
      return null;
    }
    const { rows } = await client.query<BeverageOptionRow>(
      'SELECT * FROM beverage_options WHERE id = $1 AND active = TRUE',
      [optionId],
    );
    const option = rows[0];
    if (!option) {
      throw new AppError('BEVERAGE_REQUIRED', 'Selected beverage option is not available.', 422, {
        beverageOptionId: optionId,
      });
    }
    return { id: option.id, name: option.name, code: option.code, description: option.description };
  }

  /**
   * Step 8: souvenir rules.
   *  - customization is mandatory when the offer/allocation requires it
   *    (BR-SOU-02), driven by `offer_allocations.requires_souvenir`
   *  - each group's configured min/max must be satisfied
   *  - an option must belong to the group it was submitted under
   *  - a group may not repeat within one ticket
   * Every selection carries an immutable snapshot so later catalog edits never
   * rewrite history (AC-SOU-06).
   */
  async resolveSouvenirSelections(
    client: Pick<import('pg').PoolClient, 'query'>,
    selections: readonly {
      optionGroupId: string;
      optionId: string;
      quantity: number;
    }[] | undefined,
    required: boolean,
  ): Promise<ResolvedSouvenirSelection[]> {
    if (!selections || selections.length === 0) {
      if (!required) return [];
      throw new AppError(
        'SOUVENIR_SELECTION_REQUIRED',
        'Souvenir customization is required for every ticket.',
        422,
      );
    }

    const groupIds = [...new Set(selections.map((selection) => selection.optionGroupId))];
    const { rows: groupRows } = await client.query<SouvenirOptionGroupRow>(
      `SELECT * FROM souvenir_option_groups WHERE id = ANY($1::uuid[]) AND active = TRUE`,
      [groupIds],
    );
    const groups = new Map(groupRows.map((group) => [group.id, group]));

    const optionIds = [...new Set(selections.map((selection) => selection.optionId))];
    const { rows: optionRows } = await client.query<SouvenirOptionRow>(
      `SELECT * FROM souvenir_options WHERE id = ANY($1::uuid[]) AND active = TRUE`,
      [optionIds],
    );
    const options = new Map(optionRows.map((option) => [option.id, option]));

    const resolved: ResolvedSouvenirSelection[] = [];
    for (const selection of selections) {
      const group = groups.get(selection.optionGroupId);
      const option = options.get(selection.optionId);
      if (!group) {
        throw new AppError(
          'SOUVENIR_SELECTION_INVALID',
          'Souvenir option group is not available.',
          422,
          { optionGroupId: selection.optionGroupId },
        );
      }
      if (!option || option.option_group_id !== group.id) {
        throw new AppError(
          'SOUVENIR_SELECTION_INVALID',
          'Souvenir option does not belong to the selected group.',
          422,
          { optionGroupId: selection.optionGroupId, optionId: selection.optionId },
        );
      }
      if (!Number.isInteger(selection.quantity) || selection.quantity < 1) {
        throw new AppError(
          'SOUVENIR_SELECTION_INVALID',
          'Souvenir selection quantity must be a positive integer.',
          422,
          { optionId: selection.optionId, quantity: selection.quantity },
        );
      }

      resolved.push({
        optionGroupId: group.id,
        groupCode: group.code,
        groupName: group.name,
        optionId: option.id,
        optionCode: option.code,
        optionName: option.name,
        quantity: selection.quantity,
        groupSnapshot: {
          id: group.id,
          code: group.code,
          name: group.name,
          description: group.description,
          selection_min: group.selection_min,
          selection_max: group.selection_max,
          display_order: group.display_order,
        },
        optionSnapshot: {
          id: option.id,
          code: option.code,
          name: option.name,
          description: option.description,
          image_url: option.image_url,
          metadata: option.metadata,
          display_order: option.display_order,
        },
      });
    }

    const perGroup = new Map<string, number>();
    for (const selection of resolved) {
      perGroup.set(
        selection.optionGroupId,
        (perGroup.get(selection.optionGroupId) ?? 0) + selection.quantity,
      );
    }
    for (const [groupId, count] of perGroup) {
      const group = groups.get(groupId);
      if (!group) continue;
      if (count < group.selection_min || count > group.selection_max) {
        throw new AppError(
          'SOUVENIR_SELECTION_INVALID',
          `Souvenir group "${group.name}" requires between ${group.selection_min} and ${group.selection_max} selection(s).`,
          422,
          {
            optionGroupId: groupId,
            selected: count,
            min: group.selection_min,
            max: group.selection_max,
          },
        );
      }
    }

    const seenGroups = new Set<string>();
    for (const selection of resolved) {
      if (seenGroups.has(selection.optionGroupId)) {
        throw new AppError(
          'SOUVENIR_SELECTION_INVALID',
          'Each souvenir option group may only be selected once per ticket.',
          422,
          { optionGroupId: selection.optionGroupId },
        );
      }
      seenGroups.add(selection.optionGroupId);
    }

    return resolved;
  }
}