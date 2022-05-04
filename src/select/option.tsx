import {
  computed,
  ref,
  SetupContext,
  toRefs,
  watch,
  onMounted,
  inject,
  onBeforeUnmount,
  defineComponent,
} from '@vue/composition-api';
import Vue from 'vue';
import { ScopedSlotReturnValue } from 'vue/types/vnode';
import get from 'lodash/get';
import { renderContent } from '../utils/render-tnode';
import { scrollSelectedIntoView } from '../utils/dom';
import { prefix } from '../config';
import CLASSNAMES from '../utils/classnames';
import ripple from '../utils/ripple';
import props from './option-props';
import { TdOptionProps } from './type';
import Checkbox from '../checkbox/index';
import { SelectInstance } from './instance';

const selectName = `${prefix}-select`;
export interface OptionInstance extends Vue {
  tSelect: SelectInstance;
}

export default defineComponent({
  name: 'TOption',
  props: { ...props },
  components: {
    TCheckbox: Checkbox,
  },
  directives: { ripple },
  setup(props: TdOptionProps, context: SetupContext) {
    const isHover = ref(false);
    const formDisabled = ref(undefined);
    const { value, label, disabled } = toRefs(props);

    const tSelect: any = inject('tSelect');
    watch(value, () => {
      tSelect && tSelect.test;
      tSelect && tSelect.getOptions(this);
    });
    watch(label, () => {
      tSelect && tSelect.getOptions(this);
    });
    const tDisabled = computed(() => formDisabled.value || disabled.value);
    const hovering = computed(() => (
      tSelect
        && tSelect.visible
        && tSelect.hoverOptions[tSelect.hoverIndex]
        && tSelect.hoverOptions[tSelect.hoverIndex][tSelect.realValue] === value.value
    ));
    watch(hovering, (val) => {
      if (val) {
        const timer = setTimeout(() => {
          scrollSelectedIntoView(tSelect.getOverlayElm(), context.root.$el as HTMLElement);
          clearTimeout(timer);
        }, tSelect.popupOpenTime); // 待popup弹出后再滚动到对应位置
      }
    });
    const multiLimitDisabled = computed(() => {
      if (tSelect && tSelect.multiple && tSelect.max) {
        if (
          tSelect.value instanceof Array
          && tSelect.value.indexOf(value.value) === -1
          && tSelect.max <= tSelect.value.length
        ) {
          return true;
        }
      }
      return false;
    });
    const classes = computed(() => [
      `${prefix}-select-option`,
      {
        [CLASSNAMES.STATUS.disabled]: tDisabled || multiLimitDisabled,
        [CLASSNAMES.STATUS.selected]: selected.value,
        [CLASSNAMES.SIZE[tSelect && tSelect.size]]: tSelect && tSelect.size,
        [`${prefix}-select-option__hover`]: hovering.value,
      },
    ]);
    const isCreatedOption = computed(() => tSelect.creatable && value.value === tSelect.searchInput);
    const show = computed(() => {
      /**
       * 此属性主要用于slots生成options时显示控制，直传options由select进行显示控制
       * create的option，始终显示
       * canFilter只显示待匹配的选项
       */
      if (!tSelect) return false;
      if (isCreatedOption.value) return true;
      if (tSelect.canFilter && tSelect.searchInput !== '') {
        return tSelect.filterOptions.some((option: TdOptionProps) => get(option, tSelect.realValue) === value.value);
      }
      return true;
    });
    const labelText = computed(() => label.value || value.value);
    const selected = computed(() => {
      let flag = false;
      if (!tSelect) return false;
      if (tSelect.value instanceof Array) {
        if (tSelect.labelInValue) {
          flag = tSelect.value.map((item: any) => get(item, tSelect.realValue)).indexOf(value.value) !== -1;
        } else {
          flag = tSelect.value.indexOf(value.value) !== -1;
        }
      } else if (typeof tSelect.value === 'object') {
        flag = get(tSelect.value, tSelect.realValue) === value.value;
      } else {
        flag = tSelect.value === value.value;
      }
      return flag;
    });
    const select = (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      if (tDisabled.value || multiLimitDisabled.value) {
        return false;
      }
      const parent = context.root.$el.parentNode as HTMLElement;
      if (parent && parent.className.indexOf(`${selectName}__create-option`) !== -1) {
        tSelect && tSelect.createOption(value.value.toString());
      }
      tSelect && tSelect.onOptionClick(value.value, e);
    };
    const mouseEvent = (v: boolean) => {
      isHover.value = v;
    };
    onMounted(() => {
      tSelect && tSelect.getOptions(this);
    });
    onBeforeUnmount(() => {
      tSelect && tSelect.hasSlotOptions && tSelect.destroyOptions(this);
    });
    return {
      mouseEvent,
      select,
      classes,
      tSelect,
    };
  },
  render() {
    const {
      classes, labelText, selected, disabled, multiLimitDisabled, show, tSelect,
    } = this;
    const children: ScopedSlotReturnValue = renderContent(this, 'default', 'content');
    const optionChild = children || labelText;
    return (
      <li
        v-show={show}
        class={classes}
        onMouseenter={this.mouseEvent.bind(true)}
        onMouseleave={this.mouseEvent.bind(false)}
        onClick={this.select}
        v-ripple={this.keepAnimation.ripple}
      >
        {tSelect && tSelect.multiple ? (
          <t-checkbox
            checked={selected}
            disabled={disabled || multiLimitDisabled}
            nativeOnClick={(e: MouseEvent) => {
              e.preventDefault();
            }}
          >
            {optionChild}
          </t-checkbox>
        ) : (
          <span>{optionChild}</span>
        )}
      </li>
    );
  },
});
