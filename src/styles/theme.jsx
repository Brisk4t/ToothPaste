import { accordion } from "@material-tailwind/react";

export const theme = {
    badge: {
        defaultProps: {
            color: "primary",
        },
        valid: {
            colors: ["primary", "secondary", "accent", "background", "shelf", "hover"],
        },
        styles:{
            base: {},

            colors: {
                primary: {background: "bg-primary",color: "text-white"},
                secondary: {background: "bg-secondary",color: "text-white"},
                accent: {background: "bg-accent",color: "text-white"},
                background: {background: "bg-background",color: "text-white"},
                shelf: {background: "bg-shelf",color: "text-white"},
                hover: {background: "bg-hover",color: "text-white"},
            },
        },
    },

    accordion: {
        styles: {
            base: {
                container: {
                    background: "!bg-transparent !focus:bg-transparent !hover:bg-transparent !active:bg-transparent !selected:bg-transparent",
                },
                header: {
                    initial: {
                        color: "text-text hover:text-text focus:text-text",
                        background: "!bg-transparent !focus:bg-transparent !hover:bg-transparent !active:bg-transparent !selected:bg-transparent",
                        hover: "hover:bg-transparent text-text",
                        userSelect: "!select-transparent",
                    },
                    active: {
                        color: "text-text hover:text-text",
                        background: "!bg-transparent !focus:bg-transparent !hover:bg-transparent !active:bg-transparent selected:bg-transparent",
                        hover: "hover:bg-transparent text-text",
                        userSelect: "select-transparent",

                    },
                    // selected: {
                    //     color: "text-text hover:text-text",
                    //     bg: "bg-transparent focus:bg-transparent hover:bg-transparent",
                    //     hover: "hover:bg-transparent text-text",
                    //     userSelect: "select-transparent",

                    // },
                },
            },
        },
    },
    list: {
        defaultProps: {
        ripple: true,
        className: "",
        },
        styles: {
        base: {
            list: {
            bg: "bg-transparent",
            },
            item: {
                initial: {
                    background:"focus:bg-transparent select:bg-transparent hover:bg-transparent active:bg-transparent",
                    color: "text-text",
                    borderRadius: "rounded-lg",
                    border: "hover:bg-transparent hover:outline-hover focus:outline-text focus:outline-offset-2 focus:outline-2 active:outline-text",
                },
                selected: {
                    background: "bg-transparent focus:bg-transparent hover:bg-transparent active:bg-transparent",
                    borderRadius: "rounded-lg",
                    border: "outline-text outline-offset-2 outline-2",
            },
            },
        },
        },
    },
};