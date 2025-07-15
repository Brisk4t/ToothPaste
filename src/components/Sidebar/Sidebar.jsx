import React from "react";
import {
  IconButton,
  Badge,
  Card,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
  ListItemSuffix,
  Chip,
  Accordion,
  AccordionHeader,
  AccordionBody,
  Alert,
  Button,
} from "@material-tailwind/react";
import {
  HomeIcon ,
  ChevronRightIcon,
  ClipboardIcon,
  PlayIcon,
  LinkIcon,
  ArrowPathIcon
} from "@heroicons/react/24/outline";
  
import { useBLEContext } from "../../context/BLEContext";
import ToothPaste from '../../assets/ToothPaste.png';


// Status icon for a given device
function ConnectionButton({connected }) {
  const { connectToDevice, status, device } = useBLEContext();

  const borderClass = {
    0: "border-secondary",
    1: "border-primary",
    2: "border-orange", // make sure you defined `border-tertiary` in Tailwind config
  }[status] || "border-orange"; // fallback if undefined

  return (
    <div className="flex justify-left w-full">
      {/* <Badge color={status ? "primary" : "secondary"} onClick={connectToDevice}>
      </Badge> */}
      <Button className={`flex items-center justify-between w-full p-4 border-2 ${borderClass} bg-transparent hover:border-text `} onClick={connectToDevice}>
          <Typography variant="h6" color="text" className="text-lg font-sans font-medium normal-case ">
              {device ? device.name : "Connect to Device"}
          </Typography>
          <ArrowPathIcon className="text-text h-6 w-6" />
      </Button>
    </div>
  );
}

export function SidebarWithLogo({ onOpenPairing, onNavigate, activeView}) {
  const [open, setOpen] = React.useState(0);
  const [openAlert, setOpenAlert] = React.useState(true);
  const { status, device } = useBLEContext();

  const handleOpen = (value) => {
    setOpen(open === value ? 0 : value);
  };
 
  return (
    <Card className={'h-[calc(100vh)] w-full max-w-[20rem] p-3 shadow-xl bg-shelf text-text '}>
      
      <div className="mb-2 flex items-center gap-1 p-4">
        <img src={ToothPaste} alt="brand" className="h-12 w-12 p-0" />
        <Typography variant="h3" color="text">
          'ToothPaste
        </Typography>
      </div>

      <List className="text-text gap-4">
          <ConnectionButton connected={status} />
        {/* <Accordion
          open={open === 1}
          icon={
            <ConnectionIcon/>
          }
        >
          <ListItem className={`p-0 border-2 ${status ? 'border-primary' : 'border-secondary'} hover:border-white focus:border-transparent`} selected={open === 1}>
            <AccordionHeader onClick={() => handleOpen(1)} className="border-b-0 border-hover p-3">
              
            </AccordionHeader>
          </ListItem>
          <AccordionBody className="py-1 m-4">
            <List className="p-0 gap-4">
              <ListItem>
                Analytics
                <ListItemSuffix>
                  <ChevronRightIcon strokeWidth={3} className="h-3 w-5" />
                </ListItemSuffix>
              </ListItem>
            </List>
          </AccordionBody>
        </Accordion> */}
        <hr className="my-0 border-none" />
        <Typography variant="h4" className="mb-0 px-1 text-text">
          Actions
        </Typography>

        <ListItem className={`ml-1 ${activeView === 'paste' ? 'outline-text' : ''}`} onClick={() => onNavigate('paste')}>
          <ListItemPrefix>
            <ClipboardIcon className="h-5 w-5" />
          </ListItemPrefix>
          Paste
          <ListItemSuffix>
          </ListItemSuffix>
        </ListItem>

        <ListItem className={`ml-1 ${activeView === 'live' ? 'outline-text' : ''}`} onClick={() => onNavigate('live')}>
          <ListItemPrefix>
            <PlayIcon className="h-5 w-5" />
          </ListItemPrefix>
          Live Capture
        </ListItem>


        {device && (
          <ListItem className="ml-1" onClick={onOpenPairing}>
            <ListItemPrefix>
              <LinkIcon className="h-5 w-5" />
            </ListItemPrefix>
            Pair Device
          </ListItem>
        )}

      </List>
    </Card>
  );
}