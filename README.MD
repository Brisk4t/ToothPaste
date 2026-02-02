# ToothPaste



# Generating nanopb packet files

For consistency and readability ToothPaste uses Protobuf packets. These are generated for embedded devices using nanopb

## Setup

1. Install Protoc 
2. Install nanopb 
3. Run ```"protoc -I. --nanopb_out=${workspaceFolder}/components/toothPacket toothpacket.proto```  [from the shared ```./shared``` folder](#note-on-the-generate-command)





#### Note on the generate command
It seems like the nanopb generation command cannot specify the location of the .options file that compiles into static sized arrays rather than iterators so the command must be run from within 
that folder.

I haven't had a chance to look into it and its just an aesthetic thing so idc too much but someday I'll figure that out.