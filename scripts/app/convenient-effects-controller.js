import DynamicEffectsAdder from '../dynamic-effects-adder.js';
import Settings from '../settings.js';

/**
 * Controller class that handles events from the app and manipulating the underlying Foundry data
 */
export default class ConvenientEffectsController {
  /**
   * Initializes the controller and its dependencies
   *
   * @param {ConvenientEffectsApp} viewMvc - the app that the controller can interact with
   */
  constructor(viewMvc) {
    this._viewMvc = viewMvc;

    this._settings = new Settings();
    this._dynamicEffectsAdder = new DynamicEffectsAdder();
  }

  /**
   * Configures and returns the data that the app will send to the template
   *
   * @returns the data to pass to the template
   */
  get dataForView() {
    return {
      folders: [
        {
          label: 'Favorites',
          effects: this._fetchFavorites(),
        },
        {
          label: 'Conditions',
          effects: this._fetchUnfavoritedConditions(),
        },
        {
          label: 'Spells',
          effects: this._fetchUnfavoritedSpells(),
        },
        {
          label: 'Other',
          effects: this._fetchUnfavoritedOther(),
        },
      ],
    };
  }

  _fetchFavorites() {
    return this._settings.favoriteEffectNames
      .map((name) => {
        return game.dfreds.effects.all.find((effect) => effect.name == name);
      })
      .sort((a, b) => {
        let nameA = a.name.toLowerCase();
        let nameB = b.name.toLowerCase();

        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
      });
  }

  _fetchUnfavoritedConditions() {
    const effects = game.dfreds.effects;
    return effects.conditions.filter(
      (effect) => !this._settings.favoriteEffectNames.includes(effect.name)
    );
  }

  _fetchUnfavoritedSpells() {
    const effects = game.dfreds.effects;
    return effects.spells.filter(
      (effect) => !this._settings.favoriteEffectNames.includes(effect.name)
    );
  }

  _fetchUnfavoritedOther() {
    const effects = game.dfreds.effects;
    return effects.other.filter(
      (effect) => !this._settings.favoriteEffectNames.includes(effect.name)
    );
  }

  /**
   * Remove the collapsed class from all saved, expanded folders
   */
  expandSavedFolders() {
    this._settings.expandedFolders.forEach((folderName) => {
      this._viewMvc.expandFolder(folderName);
    });
  }

  /**
   * Handles clicks on the collapse all button
   *
   * @param {MouseEvent} event
   */
  onCollapseAllClick(event) {
    this._viewMvc.collapseAllFolders();
    this._settings.clearExpandedFolders();
  }

  /**
   * Handles clicks on folders by collapsing or expanding them
   *
   * @param {MouseEvent} event - event that corresponds to clicking on the folder
   */
  onFolderClick(event) {
    let folderName = event.currentTarget.parentElement.dataset.folderLabel;

    if (this._viewMvc.isFolderCollapsed(folderName)) {
      this._viewMvc.expandFolder(folderName);
    } else {
      this._viewMvc.collapseFolder(folderName);
    }

    if (this._settings.expandedFolders.includes(folderName)) {
      this._settings.removeExpandedFolder(folderName);
    } else {
      this._settings.addExpandedFolder(folderName);
    }
  }

  /**
   * Handles clicks on effect items by toggling them on or off on selected tokens
   *
   * @param {MouseEvent} event - event that corresponds to clicking an effect item
   */
  async onEffectClick(event) {
    const toggledEffect = game.dfreds.effects.all.find(
      (effect) =>
        effect.name == event.target.innerText ||
        effect.name == event.target.title
    );
    await this._toggleEffect(toggledEffect);
  }

  async _toggleEffect(toggledEffect) {
    const controlledTokens = canvas.tokens.controlled;

    if (controlledTokens.length === 0) {
      this._viewMvc.notifyNoTokensSelected();
      return;
    }

    for (const actor of controlledTokens.map((token) => token.actor)) {
      const activeEffecData = toggledEffect.convertToActiveEffectData();

      const effectToRemove = actor.data.effects.find(
        (effect) =>
          effect.data.label == 'Convenient Effect: ' + activeEffecData.name
      );

      if (effectToRemove) {
        await actor.deleteEmbeddedDocuments('ActiveEffect', [
          effectToRemove.id,
        ]);
      } else {
        if (toggledEffect.isDynamic) {
          await this._dynamicEffectsAdder.addDynamicEffects(
            toggledEffect,
            actor
          );
        }

        await actor.createEmbeddedDocuments('ActiveEffect', [activeEffecData]);
      }
    }
  }

  /**
   * Handle adding the effect to the favorites settings and to the favorites folder
   *
   * @param {jQuery} effectItem - jQuery element represented the effect list item
   */
  onAddFavorite(effectItem) {
    const effectName = effectItem.data().effectName;

    // Don't add favorites twice
    if (this._settings.favoriteEffectNames.includes(effectName)) return;

    this._settings.addFavoriteEffect(effectName);
    this._viewMvc.render();
  }

  /**
   * Handle removing the effect from the favorites settings and from the favorites folder
   *
   * @param {jQuery} effectItem - jQuery element represented the effect list item
   */
  onRemoveFavorite(effectItem) {
    const effectName = effectItem.data().effectName;

    this._settings.removeFavoriteEffect(effectName);
    this._viewMvc.render();
  }

  /**
   * Handles starting the drag for effect items
   *
   * @param {DragEvent} event - event that corresponds to the drag start
   */
  onEffectDragStart(event) {
    const effectName = event.target.dataset.effectName;
    event.dataTransfer.setData('text/plain', effectName);
  }

  /**
   * Handles dragging an effect over a folder
   *
   * @param {DragEvent} event - event that corresponds to the drag over
   */
  onFolderDragOver(event) {
    if (!this._isEventTargetFavorites(event)) {
      return;
    }
    event.preventDefault();
    this._viewMvc.addDropTargetClassToFavorites();
  }

  /**
   * Handles dragging an effect off of a folder
   *
   * @param {DragEvent} event - event that corresponds to the drag leave
   */
  onFolderDragLeave(event) {
    if (!this._isEventTargetFavorites(event)) {
      return;
    }
    event.preventDefault();
    this._viewMvc.removeDropTargetClassFromFavorites();
  }

  /**
   * Handles dropping an effect onto a folder
   *
   * @param {DragEvent} event - event that corresponds to the drop
   */
  onDropOntoFolder(event) {
    if (!this._isEventTargetFavorites(event)) {
      return;
    }

    const effectName = event.dataTransfer.getData('text/plain');

    // Don't add favorites twice
    if (!this._settings.favoriteEffectNames.includes(effectName)) {
      this._settings.addFavoriteEffect(effectName);
    }

    this._viewMvc.render();
  }

  /**
   * Handles search text changes
   * 
   * @param {KeyboardEvent} event - event that corresponds to the text entered
   * @param {string} query - string representation of the entered search text
   * @param {RegExp} regex - the regex representation of the entered search text
   * @param {HTML} html - the html the SearchFilter is being applied to
   */
  onSearchTextChange(event, query, regex, html) {
    const isSearch = !!query;
    const displayedData = this.dataForView.folders;

    let effectNames = new Set();
    let folderLabels = new Set();

    if (isSearch) {
      for (let folder of displayedData) {
        for (let effect of folder.effects) {
          if (regex.test(SearchFilter.cleanQuery(effect.name))) {
            effectNames.add(effect.name);
            folderLabels.add(folder.label);
          }
        }
      }
    }

    for (let el of html.querySelectorAll('.directory-item')) {
      if (el.classList.contains('entity')) {
        el.style.display =
          !isSearch || effectNames.has(el.dataset.effectName) ? 'flex' : 'none';
      }

      if (el.classList.contains('folder')) {
        let match = isSearch && folderLabels.has(el.dataset.folderLabel);
        el.style.display = !isSearch || match ? 'flex' : 'none';
        if (isSearch && match) el.classList.remove('collapsed');
      }
    }
  }

  _isEventTargetFavorites(event) {
    return event.currentTarget.dataset.folderLabel === 'Favorites';
  }
}